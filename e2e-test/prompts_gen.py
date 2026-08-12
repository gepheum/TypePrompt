from dataclasses import dataclass
from collections.abc import Sequence

from typing import Annotated, Any, Final, Literal, Never, Optional, Protocol, Union, final, overload

import pydantic


@dataclass(frozen=True)
class PromptMaker:
  _data: _internal.Templates | None = None

  def get_template(
    self,
    id: Literal['Main:MyTemplate'],
  ) -> Prompt[
    schema.main.my_template.Input,
    schema.main.my_template.Output,
  ]:
    return _get_template_impl(id, self._data)


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
      zoo_bar: schema.meta.Meta_ZooBar | None = None


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

        first_name: str
        last_name: str
        foo_to_bar: dict[str, int] | None = None


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
class _internal:
  class Templates(pydantic.BaseModel):
    signature: str
    templates: dict[str, _internal.Template]
    tools: dict[str, _internal.Tool]
    # The key is a relative path to a .xml file. The value is the file content.
    source_files: dict[str, str]


  class Template(pydantic.BaseModel):
    name: str
    namespace: str
    output_format: _internal.OutputFormat
    tools: list[_internal.TemplateTool]
    contents: _internal.TemplateContents
    snippets: dict[str, _internal.Snippet]
    input_json_schema: Any = None
    output_json_schema: Any = None


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
    default_content: _internal.TemplateContent


  class TemplateContent(pydantic.BaseModel):
    meta: Any = None
    system: list[_internal.BodyPiece] | None = None
    user: list[_internal.BodyPiece] | None = None
    examples: list[_internal.FewShotExample] | None = None


  class FewShotExample(pydantic.BaseModel):
    input: Any
    output: Any
    intermediate_steps: list[_internal.FewShotExample_IntermediateSteps]


  class FewShotExample_IntermediateSteps(pydantic.BaseModel):
    tool_calls: list[_internal.ToolCallExample]


  class ToolCallExample(pydantic.BaseModel):
    call_id: str
    tool_id: str
    tool_name: str
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
    is_: _internal.Snippet_KindSnippetIf_Is
    then: list[_internal.BodyPiece]
    else_: list[_internal.BodyPiece]


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
    input_json_schema: Any = None
    output_json_schema: Any = None


_templates_data: Final = _internal.Templates.model_validate_json(
  "{\"signature\":\"\",\"tools\":{\"Main:myTool\":{\"id\":\"Main:myTool\",\"name\":\"myTool\",\"description\":\"A tool that does something\"}},\"templates\":{\"Main:MyTemplate\":{\"name\":\"MyTemplate\",\"namespace\":\"Main\",\"outputFormat\":\"json\",\"tools\":[{\"id\":\"Main:myTool\",\"name\":\"myTool\"}],\"contents\":{\"kind\":\"noVariants\",\"content\":{\"meta\":{\"temperature\":0.7,\"foobar\":\"bar\"},\"system\":[{\"kind\":\"insertSnippet\",\"snippet\":\"greet\",\"indent\":\"\"},{\"kind\":\"text\",\"text\":\"\\n\\nHow many characters are in your full name?\"}],\"user\":[{\"kind\":\"text\",\"text\":\"Your \"},{\"kind\":\"text\",\"text\":\"firstName\"},{\"kind\":\"text\",\"text\":\" is: \"},{\"kind\":\"insertVal\",\"val\":{\"kind\":\"property\",\"left\":{\"kind\":\"input\"},\"property\":\"firstName\"},\"format\":\"text\",\"indent\":\"\"},{\"kind\":\"text\",\"text\":\"\\nYour \"},{\"kind\":\"text\",\"text\":\"lastName\"},{\"kind\":\"text\",\"text\":\" is: \"},{\"kind\":\"insertVal\",\"val\":{\"kind\":\"property\",\"left\":{\"kind\":\"input\"},\"property\":\"lastName\"},\"format\":\"text\",\"indent\":\"\"},{\"kind\":\"text\",\"text\":\"\\n\\nFor example \"},{\"kind\":\"text\",\"text\":\"{\\\"firstName\\\": \\\"Bo\\\", \\\"lastName\\\": \\\"Zo\\\"}\"}],\"examples\":[{\"input\":{\"firstName\":\"John\",\"lastName\":\"Doe\"},\"output\":{\"x\":8},\"intermediateSteps\":[{\"toolCalls\":[{\"callId\":\"myCall\",\"toolId\":\"Main:myTool\",\"toolName\":\"myTool\",\"input\":{\"foo\":\"hello\"},\"output\":{\"bar\":\"world\"}}]}]},{\"input\":{\"firstName\":\"Jane\",\"lastName\":\"Smith\"},\"output\":{\"x\":9},\"intermediateSteps\":[]}]}},\"snippets\":{\"greet\":{\"kind\":\"snippet\",\"body\":[{\"kind\":\"text\",\"text\":\"Hello,\\n\"}]}}}},\"sourceFiles\":{\"/Users/clementroux/Documents/Gepheum/typeprompt/e2e-test/prompts/hello_world.xml\":\"<meta>\\n  type Meta = {\\n    /** Temperature setting for the template */\\n    temperature: number;\\n    foobar?: \\\"foo\\\" | \\\"bar\\\";\\n    zooBar?: {\\n        kind: \\\"foo\\\";\\n        foo: string;\\n      } | {\\n        kind: \\\"bar\\\";\\n        bar: string;\\n      };\\n  };\\n</meta>\\n\\n<tool name=\\\"myTool\\\">\\n  <description>\\n    A tool that does something\\n  </description>\\n\\n  <schema>\\n    type Input = {\\n      foo: string;\\n      x?: integer;\\n      y?: integer;\\n    };\\n\\n    type Output = {\\n      bar: string;\\n    };\\n  </schema>\\n</tool>\\n\\n<template name=\\\"MyTemplate\\\">\\n  <meta>\\n    temperature: 0.7\\n    foobar: bar\\n  </meta>\\n\\n  <tools>\\n    - tool: myTool\\n  </tools>\\n\\n  <schema>\\n    /** The input */\\n    type Input = {\\n      firstName: string;\\n      lastName: string;\\n      fooToBar?: {[name: string]: integer};\\n    };\\n\\n    /**\\n     * The\\n     * output\\n     */\\n    type Output = {\\n      x: integer;\\n    };\\n  </schema>\\n\\n  <system>\\n    <insert snippet=\\\"greet\\\"/>\\n\\n    How many characters are in your full name?\\n  </system>\\n\\n  <user>\\n    Your <c>firstName</c> is: <insert val=\\\"input.firstName\\\"/>\\n    Your <c>lastName</c> is: <insert val=\\\"input.lastName\\\"/>\\n\\n    For example <c>{\\\"firstName\\\": \\\"Bo\\\", \\\"lastName\\\": \\\"Zo\\\"}</c>\\n  </user>\\n\\n  <examples>\\n    - input:\\n        firstName: \\\"John\\\"\\n        lastName: \\\"Doe\\\"\\n      output:\\n        x: 8\\n      intermediateSteps:\\n        - toolCalls:\\n          - callId: myCall\\n            tool: myTool\\n            input:\\n              foo: \\\"hello\\\"\\n            output:\\n              bar: \\\"world\\\"\\n    - input:\\n        firstName: \\\"Jane\\\"\\n        lastName: \\\"Smith\\\"\\n      output:\\n        x: 9\\n  </examples>\\n\\n  <snippet name=\\\"greet\\\">\\n    Hello,\\n\\n  </snippet>\\n</template>\\n\\n\"}}",
)


@dataclass(frozen=True)
class _TemplateImpl[Input, Output, ToolImpls]:
  template_data: _internal.Template
  data: _internal.Templates

  def make(self, input: Input) -> Prompt[Output, ToolImpls]:
    pass


def _get_template_impl(
  id: TemplateId,
  data: _internal.Templates | None,
) -> Template:
  data = data or _templates_data
  template = data.templates[id]
  ret: _TemplateImpl = _TemplateImpl(template_data=template, data=data)
  return ret
