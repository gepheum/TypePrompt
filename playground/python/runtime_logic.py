from runtime_types import _internal

# <static:python-imports>
from dataclasses import dataclass
from collections.abc import Mapping, Sequence

from typing import Annotated, Any, Final, Literal, Never, Protocol, Union, final, cast, overload
import re
import json

import pydantic
# </static:python-imports>


@dataclass(frozen=True)
class PromptMaker:
  _data: _internal.Templates | None = None

  @overload
  def get_template(self, id: Literal["Main:MyTemplate"]) -> Template[str, str, None]:
    ...
  @overload
  def get_template(self, id: Literal["Main:OtherTemplate"]) -> Template[int, str, None]:
    ...
  def get_template(self, id: TemplateId) -> Template:
    return _get_template_impl(id, self._data)


# <static:python-public-types>
class Template[Input, Output, ToolImpls = None](Protocol):
  def make(self, input: Input) -> Prompt[Output, ToolImpls]:
    ...


@dataclass(frozen=True)
class Prompt[Output, ToolImpls = None]:
  """A fully resolved prompt ready to be sent to an LLM."""

  # Metadata for this prompt.
  meta: schema.meta.Meta
  system_message: str
  user_message: str
  examples: Sequence[FewShotExample]
  # The tools which can be called by the LLM, keyed by tool name.
  tools: Mapping[str, Tool]
  output_format: OutputFormat[Output]
  template_id: TemplateId

  def parse_response(self, response: str) -> Output:
    """Parse the LLM response into the expected output type."""
    return _parse_response_impl(response, self)

  async def call_tools(
    self,
    tool_calls: Sequence[ToolCall],
    impls: ToolImpls,
  ) -> Sequence[ToolCallResponse]:
    """Execute the given tool calls in parallel."""
    return await _call_tools_impl(tool_calls, impls, self)


@dataclass(frozen=True)
class FewShotExample:
  """A single few-shot example.

  Consists of a user message, optional intermediate tool-call steps, and the
  expected response.
  """

  user_message: str
  intermediate_steps: Sequence[IntermediateStepExample];
  response: str


@dataclass(frozen=True)
class IntermediateStepExample:
  # Tool calls made in parallel at this step.
  tool_calls: Sequence[ToolCallExample]


@dataclass(frozen=True)
class ToolCallExample:
  call_id: str
  tool_name: str
  # Stringified JSON input
  stringified_input: str
  # Stringified JSON output
  stringified_output: str


@dataclass(frozen=True)
class Tool[Input, Output]:
  name: str
  description: str
  input_adapter: pydantic.TypeAdapter[Input]
  output_adapter: pydantic.TypeAdapter[Output]


@dataclass(frozen=True)
class JsonOutputFormat[Output]:
  format: Literal['json']
  type_adapter: pydantic.TypeAdapter[Output]


@dataclass(frozen=True)
class TextOutputFormat:
  format: Literal['text']


type OutputFormat[Output] = JsonOutputFormat[Output] | TextOutputFormat


@dataclass(frozen=True)
class ToolCall:
  call_id: str
  tool_name: str
  stringified_input: str

@dataclass(frozen=True)
class ToolCallResponse:
  call_id: str
  stringified_output: str
# </static:python-public-types>


# <generated>
# Uniquely identifies a prompt template.
type TemplateId = Literal[
  'Main:MyTemplate',
  'Main:OtherTemplate',
]


@final
class schema:
  class meta:
    class Meta(pydantic.BaseModel):
      temperature: float
  class main:
    class my_template:
      type Input = str
      type Output = int
    class other_template:
      type Input = int
      type Output = str


_templates_data: Final = (
  _internal.Templates(
    signature="",
    templates=dict(),
    tools=dict(),
    source_files=dict(),
  )
)


_TOOL_NAME_TO_METHOD_NAME: Mapping[str, str] = {
  'myTool': 'my_tool',
}


def tool_name_to_method_name(tool_name: str) -> str:
  return _TOOL_NAME_TO_METHOD_NAME[tool_name]
# </generated>


# <static:python-logic>
def _parse_response_impl[Output](response: str, prompt: Prompt[Output, Any]) -> Output:
  output_format = prompt.output_format
  match output_format.format:
    case "json":
      response = response.strip()
      if response.startswith("```"):
        # Remove code fences (``` or ```json) from start and end
        response = re.sub(
          r"^```(?:json)?\s*\n?(.*?)\n?```$",
          r"\1",
          response,
          flags=re.DOTALL,
        ).strip()

      try:
        return output_format.type_adapter.validate_json(response, by_alias=True)
      except Exception as e:
        raise type(e)(f"Template '{prompt.template_id}': {e}") from e

    case "text":
      return cast(Output, response)


async def _call_tools_impl[ToolImpls](
  tool_calls: Sequence[ToolCall],
  impls: ToolImpls,
  prompt: Prompt[Any, ToolImpls],
) -> Sequence[ToolCallResponse]:
  import asyncio

  async def _call_one(call: ToolCall) -> ToolCallResponse:
    tool = prompt.tools.get(call.tool_name)
    if tool is None:
      raise ValueError(f"Tool not found: {call.tool_name}")
    method_name = tool_name_to_method_name(call.tool_name)
    impl = getattr(impls, method_name, None) if impls is not None else None
    if impl is None:
      raise ValueError(f"Tool implementation not found: {call.tool_name}")
    try:
      input = tool.input_adapter.validate_json(call.stringified_input, by_alias=True)
      raw_output = await impl(input)
      validated_output = tool.output_adapter.validate_python(raw_output, by_alias=True)
      stringified_output = tool.output_adapter.dump_json(validated_output, by_alias=True).decode()
    except Exception as e:
      call_info = json.dumps({"callId": call.call_id, "toolName": call.tool_name, "stringifiedInput": call.stringified_input})
      raise type(e)(f"Tool call failed: {call_info} — {e}") from e
    return ToolCallResponse(call_id=call.call_id, stringified_output=stringified_output)

  return await asyncio.gather(*(_call_one(call) for call in tool_calls))


@dataclass(frozen=True)
class _TemplateImpl[Input, Output, ToolImpls]:
  _template_data: _internal.Template
  _data: _internal.Templates

  def make(self, input: Input) -> Prompt[Output, ToolImpls]:
    pass


def _get_template_impl(
  id: TemplateId,
  data: _internal.Templates | None,
) -> Template[Any, Any, Any]:
  data = data or _templates_data
  template = data.templates[id]
  return _TemplateImpl(_template_data=template, _data=data)

# To disable linter warnings about unused imports
_ = (Annotated, Never, overload)
del _
# </static:python-logic>
