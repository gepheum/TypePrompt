from dataclasses import dataclass
from collections.abc import Mapping, Sequence

from typing import Annotated, Any, Final, Literal, Never, Protocol, Union, final, cast, overload
import re
import json

import pydantic
import yaml
import toon_format


@dataclass(frozen=True)
class PromptMaker:
  _data: _internal.Templates | None = None

  def get_template(
    self,
    id: Literal['Main:MyTemplate'],
  ) -> Template[
    schema.main.my_template.Input,
    schema.main.my_template.Output,
    tools.main.my_template.ToolImpls,
  ]:
    return _get_template_impl(id, self._data)


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
  _internal: None

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


# Uniquely identifies a prompt template.
type TemplateId = Literal[
  'Main:MyTemplate',
]


@final
class schema:
  @final
  class meta:
    # Exported as 'schema.meta.Meta'
    class Meta(pydantic.BaseModel):
      # Temperature setting for the template
      temperature: float
      foobar: schema.meta.Meta_Foobar | None = None
      zoo_bar: schema.meta.Meta_ZooBar | None = pydantic.Field(default=None, serialization_alias='zooBar')

    # Exported as 'schema.meta.Meta_Foobar'
    type Meta_Foobar = Literal[
      'foo',
      'bar',
    ]

    # Exported as 'schema.meta.Meta_ZooBar'
    type Meta_ZooBar = Annotated[
      Union[
        schema.meta.Meta_ZooBar_KindFoo,
        schema.meta.Meta_ZooBar_KindBar,
      ],
      pydantic.Field(discriminator="kind"),
    ]

    # Exported as 'schema.meta.Meta_ZooBar_KindFoo'
    class Meta_ZooBar_KindFoo(pydantic.BaseModel):
      kind: Literal['foo']
      foo: str

    # Exported as 'schema.meta.Meta_ZooBar_KindBar'
    class Meta_ZooBar_KindBar(pydantic.BaseModel):
      kind: Literal['bar']
      bar: str

  @final
  class main:
    @final
    class my_template:
      # Exported as 'schema.main.my_template.Input'
      class Input(pydantic.BaseModel):
        """The input"""

        first_name: str = pydantic.Field(serialization_alias='firstName')
        last_name: str = pydantic.Field(serialization_alias='lastName')
        foo_to_bar: dict[str, int] | None = pydantic.Field(default=None, serialization_alias='fooToBar')

      # Exported as 'schema.main.my_template.Output'
      class Output(pydantic.BaseModel):
        """
        The
        output
        """

        x: int

    @final
    class my_tool:
      # Exported as 'schema.main.my_tool.Input'
      class Input(pydantic.BaseModel):
        foo: str
        x: int | None = None
        y: int | None = None

      # Exported as 'schema.main.my_tool.Output'
      class Output(pydantic.BaseModel):
        bar: str


@final
class tools:
  @final
  class main:
    @final
    class my_template:
      class ToolImpls(Protocol):
        async def my_tool(
          self,
          input: schema.main.my_tool.Input,
        ) -> schema.main.my_tool.Output:
          ...

      type ToolName = Literal[
        'myTool',
      ]

      TOOL_NAMES: Final = (
        'myTool',
      )


_TOOL_NAME_TO_METHOD_NAME: Mapping[str, str] = {
  'myTool': 'my_tool',
}


def tool_name_to_method_name(tool_name: str) -> str:
  return _TOOL_NAME_TO_METHOD_NAME[tool_name]


_type_adapters: Final = {
  "Main:MyTemplate": (
    pydantic.TypeAdapter(schema.main.my_template.Input),
    pydantic.TypeAdapter(schema.main.my_template.Output),
  ),
  "Main:myTool": (
    pydantic.TypeAdapter(schema.main.my_tool.Input),
    pydantic.TypeAdapter(schema.main.my_tool.Output),
  ),
}


@final
class _internal:
  class Templates(pydantic.BaseModel):
    signature: str
    templates: dict[str, _internal.Template]
    tools: dict[str, _internal.Tool]
    # The key is a relative path to a .xml file. The value is the file content.
    source_files: dict[str, str] = pydantic.Field(serialization_alias='sourceFiles')

  class Template(pydantic.BaseModel):
    name: str
    namespace: str
    output_format: _internal.OutputFormat = pydantic.Field(serialization_alias='outputFormat')
    tools: list[_internal.TemplateTool]
    contents: _internal.TemplateContents
    snippets: dict[str, _internal.Snippet]
    input_json_schema: Any = pydantic.Field(default=None, serialization_alias='inputJsonSchema')
    output_json_schema: Any = pydantic.Field(default=None, serialization_alias='outputJsonSchema')

  type OutputFormat = Literal[
    'json',
    'text',
  ]

  class TemplateTool(pydantic.BaseModel):
    id: str
    name: str

  type TemplateContents = Annotated[
    Union[
      _internal.TemplateContents_KindNoVariants,
      _internal.TemplateContents_KindVariants,
    ],
    pydantic.Field(discriminator="kind"),
  ]

  class TemplateContents_KindNoVariants(pydantic.BaseModel):
    kind: Literal['noVariants']
    content: _internal.TemplateContent

  class TemplateContents_KindVariants(pydantic.BaseModel):
    kind: Literal['variants']
    variants: dict[str, _internal.TemplateContent]
    default_content: _internal.TemplateContent = pydantic.Field(serialization_alias='defaultContent')

  class TemplateContent(pydantic.BaseModel):
    meta: Any = None
    system: list[_internal.BodyPiece] | None = None
    user: list[_internal.BodyPiece] | None = None
    examples: list[_internal.FewShotExample] | None = None

  class FewShotExample(pydantic.BaseModel):
    input: Any
    output: Any
    intermediate_steps: list[_internal.FewShotExample_IntermediateSteps] = pydantic.Field(serialization_alias='intermediateSteps')

  class FewShotExample_IntermediateSteps(pydantic.BaseModel):
    tool_calls: list[_internal.ToolCallExample] = pydantic.Field(serialization_alias='toolCalls')

  class ToolCallExample(pydantic.BaseModel):
    call_id: str = pydantic.Field(serialization_alias='callId')
    tool_id: str = pydantic.Field(serialization_alias='toolId')
    tool_name: str = pydantic.Field(serialization_alias='toolName')
    input: Any
    output: Any

  type BodyPiece = Annotated[
    Union[
      _internal.BodyPiece_KindText,
      _internal.BodyPiece_KindInsertVal,
      _internal.BodyPiece_KindInsertSnippet,
    ],
    pydantic.Field(discriminator="kind"),
  ]

  class BodyPiece_KindText(pydantic.BaseModel):
    kind: Literal['text']
    text: str

  class BodyPiece_KindInsertVal(pydantic.BaseModel):
    kind: Literal['insertVal']
    val: _internal.Expression
    format: _internal.InsertFormat
    indent: str

  class BodyPiece_KindInsertSnippet(pydantic.BaseModel):
    kind: Literal['insertSnippet']
    # Snippet name.
    snippet: str
    # Only contains whitespace characters.
    indent: str

  type InsertFormat = Literal[
    'text',
    'json',
    'yaml',
    'toon',
    'csv',
    'tsv',
  ]

  type Expression = Annotated[
    Union[
      _internal.Expression_KindInput,
      _internal.Expression_KindProperty,
    ],
    pydantic.Field(discriminator="kind"),
  ]

  class Expression_KindInput(pydantic.BaseModel):
    kind: Literal['input']

  class Expression_KindProperty(pydantic.BaseModel):
    kind: Literal['property']
    left: _internal.Expression
    property: str

  type Snippet = Annotated[
    Union[
      _internal.Snippet_KindSnippet,
      _internal.Snippet_KindSnippetIf,
      _internal.Snippet_KindSnippetSwitch,
    ],
    pydantic.Field(discriminator="kind"),
  ]

  class Snippet_KindSnippet(pydantic.BaseModel):
    kind: Literal['snippet']
    body: list[_internal.BodyPiece]

  class Snippet_KindSnippetIf(pydantic.BaseModel):
    kind: Literal['snippetIf']
    expression: _internal.Expression
    is_: _internal.Snippet_KindSnippetIf_Is = pydantic.Field(serialization_alias='is')
    then: list[_internal.BodyPiece]
    else_: list[_internal.BodyPiece] = pydantic.Field(serialization_alias='else')

  type Snippet_KindSnippetIf_Is = Literal[
    'notNull',
    'notEmpty',
    'true',
  ]

  class Snippet_KindSnippetSwitch(pydantic.BaseModel):
    kind: Literal['snippetSwitch']
    expression: _internal.Expression
    branches: dict[str, list[_internal.BodyPiece]]

  class Tool(pydantic.BaseModel):
    id: str
    name: str
    description: str
    input_json_schema: Any = pydantic.Field(default=None, serialization_alias='inputJsonSchema')
    output_json_schema: Any = pydantic.Field(default=None, serialization_alias='outputJsonSchema')


_templates_data: Final = _internal.Templates.model_validate_json(
  "{\"signature\":\"\",\"tools\":{\"Main:myTool\":{\"id\":\"Main:myTool\",\"name\":\"myTool\",\"description\":\"A tool that does something\"}},\"templates\":{\"Main:MyTemplate\":{\"name\":\"MyTemplate\",\"namespace\":\"Main\",\"outputFormat\":\"json\",\"tools\":[{\"id\":\"Main:myTool\",\"name\":\"myTool\"}],\"contents\":{\"kind\":\"noVariants\",\"content\":{\"meta\":{\"temperature\":0.7,\"foobar\":\"bar\"},\"system\":[{\"kind\":\"insertSnippet\",\"snippet\":\"greet\",\"indent\":\"\"},{\"kind\":\"text\",\"text\":\"\\n\\nHow many characters are in your full name?\"}],\"user\":[{\"kind\":\"text\",\"text\":\"Your \"},{\"kind\":\"text\",\"text\":\"firstName\"},{\"kind\":\"text\",\"text\":\" is: \"},{\"kind\":\"insertVal\",\"val\":{\"kind\":\"property\",\"left\":{\"kind\":\"input\"},\"property\":\"firstName\"},\"format\":\"text\",\"indent\":\"\"},{\"kind\":\"text\",\"text\":\"\\nYour \"},{\"kind\":\"text\",\"text\":\"lastName\"},{\"kind\":\"text\",\"text\":\" is: \"},{\"kind\":\"insertVal\",\"val\":{\"kind\":\"property\",\"left\":{\"kind\":\"input\"},\"property\":\"lastName\"},\"format\":\"text\",\"indent\":\"\"},{\"kind\":\"text\",\"text\":\"\\n\\nFor example \"},{\"kind\":\"text\",\"text\":\"{\\\"firstName\\\": \\\"Bo\\\", \\\"lastName\\\": \\\"Zo\\\"}\"}],\"examples\":[{\"input\":{\"firstName\":\"John\",\"lastName\":\"Doe\"},\"output\":{\"x\":8},\"intermediateSteps\":[{\"toolCalls\":[{\"callId\":\"myCall\",\"toolId\":\"Main:myTool\",\"toolName\":\"myTool\",\"input\":{\"foo\":\"hello\"},\"output\":{\"bar\":\"world\"}}]}]},{\"input\":{\"firstName\":\"Jane\",\"lastName\":\"Smith\"},\"output\":{\"x\":9},\"intermediateSteps\":[]}]}},\"snippets\":{\"greet\":{\"kind\":\"snippet\",\"body\":[{\"kind\":\"text\",\"text\":\"Hello,\\n\"}]}}}},\"sourceFiles\":{\"/Users/clementroux/Documents/Gepheum/typeprompt/e2e-test/prompts/hello_world.xml\":\"<meta>\\n  type Meta = {\\n    /** Temperature setting for the template */\\n    temperature: number;\\n    foobar?: \\\"foo\\\" | \\\"bar\\\";\\n    zooBar?: {\\n        kind: \\\"foo\\\";\\n        foo: string;\\n      } | {\\n        kind: \\\"bar\\\";\\n        bar: string;\\n      };\\n  };\\n</meta>\\n\\n<tool name=\\\"myTool\\\">\\n  <description>\\n    A tool that does something\\n  </description>\\n\\n  <schema>\\n    type Input = {\\n      foo: string;\\n      x?: integer;\\n      y?: integer;\\n    };\\n\\n    type Output = {\\n      bar: string;\\n    };\\n  </schema>\\n</tool>\\n\\n<template name=\\\"MyTemplate\\\">\\n  <meta>\\n    temperature: 0.7\\n    foobar: bar\\n  </meta>\\n\\n  <tools>\\n    - tool: myTool\\n  </tools>\\n\\n  <schema>\\n    /** The input */\\n    type Input = {\\n      firstName: string;\\n      lastName: string;\\n      fooToBar?: {[name: string]: integer};\\n    };\\n\\n    /**\\n     * The\\n     * output\\n     */\\n    type Output = {\\n      x: integer;\\n    };\\n  </schema>\\n\\n  <system>\\n    <insert snippet=\\\"greet\\\"/>\\n\\n    How many characters are in your full name?\\n  </system>\\n\\n  <user>\\n    Your <c>firstName</c> is: <insert val=\\\"input.firstName\\\"/>\\n    Your <c>lastName</c> is: <insert val=\\\"input.lastName\\\"/>\\n\\n    For example <c>{\\\"firstName\\\": \\\"Bo\\\", \\\"lastName\\\": \\\"Zo\\\"}</c>\\n  </user>\\n\\n  <examples>\\n    - input:\\n        firstName: \\\"John\\\"\\n        lastName: \\\"Doe\\\"\\n      output:\\n        x: 8\\n      intermediateSteps:\\n        - toolCalls:\\n          - callId: myCall\\n            tool: myTool\\n            input:\\n              foo: \\\"hello\\\"\\n            output:\\n              bar: \\\"world\\\"\\n    - input:\\n        firstName: \\\"Jane\\\"\\n        lastName: \\\"Smith\\\"\\n      output:\\n        x: 9\\n  </examples>\\n\\n  <snippet name=\\\"greet\\\">\\n    Hello,\\n\\n  </snippet>\\n</template>\\n\\n\"}}",
  by_alias=True,
)


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
      stringified_output = tool.output_adapter.dump_json(raw_output, by_alias=True).decode()
    except Exception as e:
      call_info = json.dumps({"callId": call.call_id, "toolName": call.tool_name, "stringifiedInput": call.stringified_input})
      raise type(e)(f"Tool call failed: {call_info} — {e}") from e
    return ToolCallResponse(call_id=call.call_id, stringified_output=stringified_output)

  return await asyncio.gather(*(_call_one(call) for call in tool_calls))


@dataclass(frozen=True)
class _TemplateImpl[Input, Output, ToolImpls]:
  _template_id: TemplateId
  _template_data: _internal.Template
  _data: _internal.Templates

  def make(self, input: Input) -> Prompt[Output, ToolImpls]:
    def evaluate(expression: _internal.Expression, val: Any) -> Any:
      match expression.kind:
        case "input":
          return val
        case "property":
          obj = evaluate(expression.left, val)
          return cast(dict, obj)[expression.property]

    def indent(text: str, spaces: str) -> str:
      if not spaces:
        return text
      return text.replace("\n", "\n" + spaces)

    def format_table(v: Any, fmt: Literal["csv", "tsv"]) -> str:
      separator = "," if fmt == "csv" else "\t"
      rows = cast(list[dict], v)
      if not rows:
        return ""
      header = list(rows[0].keys())
      lines = [separator.join(header)]
      for row in rows:
        cells = row.values()
        if fmt == "csv":
          def csv_cell(c: Any) -> str:
            s = str(c)
            return '"' + s.replace('"', '""') + '"' if re.search(r'[",\n\r]', s) else s
          lines.append(separator.join(csv_cell(c) for c in cells))
        else:
          def tsv_cell(c: Any) -> str:
            return str(c).replace("\\", "\\\\").replace("\t", "\\t").replace("\n", "\\n").replace("\r", "\\r")
          lines.append(separator.join(tsv_cell(c) for c in cells))
      return "\n".join(lines)

    def format_value(v: Any, fmt: _internal.InsertFormat | None) -> str:
      match fmt:
        case None | "text":
          return str(v)
        case "json":
          return json.dumps(v, indent=2)
        case "yaml":
          return yaml.dump(v, allow_unicode=True, default_flow_style=False).rstrip("\n")
        case "toon":
          return toon_format.encode(v)
        case "csv" | "tsv":
          return format_table(v, fmt)

    def resolve_body(body: Sequence[_internal.BodyPiece], inp: Any, snippets: Mapping[str, _internal.Snippet]) -> str:
      parts: list[str] = []
      for piece in body:
        match piece.kind:
          case "text":
            parts.append(piece.text)
          case "insertVal":
            parts.append(indent(format_value(evaluate(piece.val, inp), piece.format), piece.indent))
          case "insertSnippet":
            snippet = snippets.get(piece.snippet)
            if snippet is None:
              raise ValueError(f"Snippet not found: {piece.snippet}")
            parts.append(indent(resolve_snippet(snippet, inp, snippets), piece.indent))
      return "".join(parts)

    def resolve_snippet(snippet: _internal.Snippet, inp: Any, snippets: Mapping[str, _internal.Snippet]) -> str:
      match snippet.kind:
        case "snippet":
          return resolve_body(snippet.body, inp, snippets)
        case "snippetIf":
          eval_result = evaluate(snippet.expression, inp)
          match snippet.is_:
            case "notEmpty":
              condition = len(eval_result) > 0
            case "notNull":
              condition = eval_result is None
            case "true":
              condition = bool(eval_result)
          return resolve_body(snippet.then if condition else snippet.else_, inp, snippets)
        case "snippetSwitch":
          eval_result = evaluate(snippet.expression, inp)
          branch = snippet.branches.get(str(eval_result))
          if branch is None:
            raise ValueError(f"Branch not found: {eval_result}")
          return resolve_body(branch, inp, snippets)

    def resolve_examples(
      examples: Sequence[_internal.FewShotExample],
      user_body: Sequence[_internal.BodyPiece],
      tmpl: _internal.Template,
    ) -> Sequence[FewShotExample]:
      result = []
      for ex in examples:
        result.append(FewShotExample(
          user_message=resolve_body(user_body, ex.input, tmpl.snippets),
          intermediate_steps=[
            IntermediateStepExample(tool_calls=[
              ToolCallExample(
                call_id=tc.call_id,
                tool_name=tc.tool_name,
                stringified_input=json.dumps(tc.input),
                stringified_output=json.dumps(tc.output),
              )
              for tc in step.tool_calls
            ])
            for step in ex.intermediate_steps
          ],
          response=format_value(ex.output, tmpl.output_format),
        ))
      return result

    input_adapter, output_adapter = _type_adapters[self._template_id]
    input = input_adapter.dump_python(input, by_alias=True)

    template = self._template_data
    snippets = template.snippets
    contents = template.contents

    if contents.kind == "noVariants":
      content = contents.content
      meta = content.meta
      system_message = resolve_body(content.system or [], input, snippets)
      user_body = content.user or []
      user_message = resolve_body(user_body, input, snippets)
      examples = resolve_examples(content.examples or [], user_body, template)
    else:
      variant = cast(dict, input)["variant"]
      variant_content = contents.variants[variant]
      default_content = contents.default_content
      meta = variant_content.meta if variant_content.meta is not None else default_content.meta
      system_body = variant_content.system if variant_content.system is not None else (default_content.system or [])
      user_body = variant_content.user if variant_content.user is not None else (default_content.user or [])
      system_message = resolve_body(system_body, input, snippets)
      user_message = resolve_body(user_body, input, snippets)
      raw_examples = variant_content.examples if variant_content.examples is not None else (default_content.examples or [])
      examples = resolve_examples(raw_examples, user_body, template)

    def make_tool(tool_spec: _internal.TemplateTool) -> Tool:
      input_adapter, output_adapter = _type_adapters[tool_spec.id]
      return Tool(
        name=tool_spec.name,
        description=self._data.tools[tool_spec.id].description,
        input_adapter=input_adapter,
        output_adapter=output_adapter,
      )

    tools = {
      tool_spec.name: make_tool(tool_spec)
      for tool_spec in template.tools
    }

    if template.output_format == "json":
      output_format = cast(OutputFormat[Output], JsonOutputFormat(format="json", type_adapter=output_adapter))
    else:
      output_format = cast(OutputFormat[Output], TextOutputFormat(format="text"))

    return Prompt(
      meta=meta,
      system_message=system_message,
      user_message=user_message,
      examples=examples,
      tools=tools,
      output_format=output_format,
      template_id=self._template_id,
      _internal=None,
    )


def _get_template_impl(
  id: TemplateId,
  data: _internal.Templates | None,
) -> Template[Any, Any, Any]:
  data = data or _templates_data
  template = data.templates[id]
  return _TemplateImpl(_template_id=id, _template_data=template, _data=data)

# To disable linter warnings about unused imports
_ = (Annotated, Never, overload)
del _
