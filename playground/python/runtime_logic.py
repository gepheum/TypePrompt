from runtime_types import _internal

# <static:python-imports>
from dataclasses import dataclass
from collections.abc import Sequence

from typing import Annotated, Any, Literal, Never, Optional, Protocol, Union, final, overload

import pydantic
# </static:python-imports>


@dataclass(frozen=True)
class PromptMaker:
  _data: _internal.Templates

  @overload
  def get_template(self, id: Literal["Main:MyTemplate"]) -> Template[str, str, None]:
    ...
  @overload
  def get_template(self, id: Literal["Main:OtherTemplate"]) -> Template[int, str, None]:
    ...
  def get_template(self, id: TemplateId) -> Any:
    return _get_template_impl(id, self._data)


# <static:python-public-types>
class Template[Input, Output, ToolImpls = None](Protocol):
  def make(self, input: Input) -> Prompt[Output, ToolImpls]:
    ...


@dataclass(frozen=True)
class Prompt[Output, ToolImpls = None]:
  meta: schema.meta.Meta
  system_message: str
  user_message: str
  examples: Sequence['FewShotExample']
  output_format: OutputFormat[Output]
  template_id: 'TemplateId'


@dataclass(frozen=True)
class FewShotExample:
  user_message: str
  intermediate_steps: Sequence['IntermediateStepExample'];
  response: str


@dataclass(frozen=True)
class IntermediateStepExample:
  # Tool calls made in parallel at this step.
  tool_calls: Sequence['ToolCallExample']


@dataclass(frozen=True)
class ToolCallExample:
  call_id: str
  tool_name: str
  # Stringified JSON input
  stringified_input: str
  # Stringified JSON output
  stringified_output: str


@dataclass(frozen=True)
class JsonOutputFormat[Output]:
  format: Literal['json']
  type_adapter: pydantic.TypeAdapter[Output]


@dataclass(frozen=True)
class TextOutputFormat:
  format: Literal['text']


type OutputFormat[Output] = JsonOutputFormat[Output] | TextOutputFormat
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
# </generated>


class _PromptMakerImpl:
  pass
