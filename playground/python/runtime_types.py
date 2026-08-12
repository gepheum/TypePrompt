# Copied from generated code. Source of truth: 'src/runtime/runtime-types-schema.ts'
# Do not edit.

from typing import Annotated, Any, Literal, Optional, Union, final
from pydantic import BaseModel, Field


@final
class _internal:
  class Templates(BaseModel):
    signature: str
    templates: dict[str, '_internal.Template']
    tools: dict[str, '_internal.Tool']
    # The key is a relative path to a .xml file. The value is the file content.
    source_files: dict[str, str]


  class Template(BaseModel):
    name: str
    namespace: str
    output_format: '_internal.OutputFormat'
    tools: list['_internal.TemplateTool']
    contents: '_internal.TemplateContents'
    snippets: dict[str, '_internal.Snippet']
    input_json_schema: Optional[Any]
    output_json_schema: Optional[Any]


  type OutputFormat = Literal[
    'json',
    'text',
  ]


  class TemplateTool(BaseModel):
    id: str
    name: str


  type TemplateContents = Annotated[
    Union[
      '_internal.TemplateContents_KindNoVariants',
      '_internal.TemplateContents_KindVariants',
    ],
    Field(discriminator="kind"),
  ]


  class TemplateContents_KindNoVariants(BaseModel):
    kind: Literal['noVariants']
    content: '_internal.TemplateContent'


  class TemplateContents_KindVariants(BaseModel):
    kind: Literal['variants']
    variants: dict[str, '_internal.TemplateContent']
    default_content: '_internal.TemplateContent'


  class TemplateContent(BaseModel):
    meta: Optional[Any]
    system: Optional[list['_internal.BodyPiece']]
    user: Optional[list['_internal.BodyPiece']]
    examples: Optional[list['_internal.FewShotExample']]


  class FewShotExample(BaseModel):
    input: Any
    output: Any
    intermediate_steps: list['_internal.FewShotExample_IntermediateSteps']


  class FewShotExample_IntermediateSteps(BaseModel):
    tool_calls: list['_internal.ToolCallExample']


  class ToolCallExample(BaseModel):
    call_id: str
    tool_id: str
    tool_name: str
    input: Any
    output: Any


  type BodyPiece = Annotated[
    Union[
      '_internal.BodyPiece_KindText',
      '_internal.BodyPiece_KindInsertVal',
      '_internal.BodyPiece_KindInsertSnippet',
    ],
    Field(discriminator="kind"),
  ]


  class BodyPiece_KindText(BaseModel):
    kind: Literal['text']
    text: str


  class BodyPiece_KindInsertVal(BaseModel):
    kind: Literal['insertVal']
    val: '_internal.Expression'
    format: '_internal.InsertFormat'
    indent: str


  class BodyPiece_KindInsertSnippet(BaseModel):
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
      '_internal.Expression_KindInput',
      '_internal.Expression_KindProperty',
    ],
    Field(discriminator="kind"),
  ]


  class Expression_KindInput(BaseModel):
    kind: Literal['input']


  class Expression_KindProperty(BaseModel):
    kind: Literal['property']
    left: '_internal.Expression'
    property: str


  type Snippet = Annotated[
    Union[
      '_internal.Snippet_KindSnippet',
      '_internal.Snippet_KindSnippetIf',
      '_internal.Snippet_KindSnippetSwitch',
    ],
    Field(discriminator="kind"),
  ]


  class Snippet_KindSnippet(BaseModel):
    kind: Literal['snippet']
    body: list['_internal.BodyPiece']


  class Snippet_KindSnippetIf(BaseModel):
    kind: Literal['snippetIf']
    expression: '_internal.Expression'
    is_: '_internal.Snippet_KindSnippetIf_Is'
    then: list['_internal.BodyPiece']
    else_: list['_internal.BodyPiece']


  type Snippet_KindSnippetIf_Is = Literal[
    'notNull',
    'notEmpty',
    'true',
  ]


  class Snippet_KindSnippetSwitch(BaseModel):
    kind: Literal['snippetSwitch']
    expression: '_internal.Expression'
    branches: dict[str, list['_internal.BodyPiece']]


  class Tool(BaseModel):
    id: str
    name: str
    description: str
    input_json_schema: Optional[Any]
    output_json_schema: Optional[Any]
