# Copied from generated code. Source of truth: 'spec-types-schema.ts'
# Do not edit.

from typing import Annotated, Any, Literal, Optional, Union, final
import pydantic


# <generated:spec>
@final
class _internal:
    class Templates(pydantic.BaseModel):
        model_config = pydantic.ConfigDict(populate_by_name=True)
        edition: int
        signature: str
        templates: dict[str, _internal.Template]
        tools: dict[str, _internal.Tool]
        # The key is a relative path to a .tp file. The value is the file content.
        source_files: dict[str, str] = pydantic.Field(
            validation_alias=pydantic.AliasChoices("sourceFiles", "source_files"),
            serialization_alias="sourceFiles",
        )

    class Template(pydantic.BaseModel):
        model_config = pydantic.ConfigDict(populate_by_name=True)
        name: str
        namespace: str
        output_format: _internal.OutputFormat = pydantic.Field(
            validation_alias=pydantic.AliasChoices("outputFormat", "output_format"),
            serialization_alias="outputFormat",
        )
        tools: list[_internal.TemplateTool]
        contents: _internal.TemplateContents
        snippets: dict[str, _internal.Snippet]
        output_json_schema: Any = pydantic.Field(
            validation_alias=pydantic.AliasChoices(
                "outputJsonSchema", "output_json_schema"
            ),
            serialization_alias="outputJsonSchema",
        )
        output_has_recursive_type: bool = pydantic.Field(
            validation_alias=pydantic.AliasChoices(
                "outputHasRecursiveType", "output_has_recursive_type"
            ),
            serialization_alias="outputHasRecursiveType",
        )

    type OutputFormat = Literal[
        "json",
        "text",
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
        kind: Literal["no-variants"]
        content: _internal.TemplateContent

    class TemplateContents_KindVariants(pydantic.BaseModel):
        model_config = pydantic.ConfigDict(populate_by_name=True)
        kind: Literal["variants"]
        variants: dict[str, _internal.TemplateContent]
        default_content: _internal.TemplateContent = pydantic.Field(
            validation_alias=pydantic.AliasChoices("defaultContent", "default_content"),
            serialization_alias="defaultContent",
        )

    class TemplateContent(pydantic.BaseModel):
        meta: Any = None
        system: list[_internal.BodyPiece] | None = None
        user: list[_internal.BodyPiece] | None = None
        examples: list[_internal.FewShotExample] | None = None

    class FewShotExample(pydantic.BaseModel):
        input: Any
        output: Any
        steps: list[_internal.FewShotExample_Steps]

    class FewShotExample_Steps(pydantic.BaseModel):
        model_config = pydantic.ConfigDict(populate_by_name=True)
        tool_calls: list[_internal.ToolCallExample] = pydantic.Field(
            validation_alias=pydantic.AliasChoices("toolCalls", "tool_calls"),
            serialization_alias="toolCalls",
        )

    class ToolCallExample(pydantic.BaseModel):
        model_config = pydantic.ConfigDict(populate_by_name=True)
        call_id: str = pydantic.Field(
            validation_alias=pydantic.AliasChoices("callId", "call_id"),
            serialization_alias="callId",
        )
        tool_id: str = pydantic.Field(
            validation_alias=pydantic.AliasChoices("toolId", "tool_id"),
            serialization_alias="toolId",
        )
        tool_name: str = pydantic.Field(
            validation_alias=pydantic.AliasChoices("toolName", "tool_name"),
            serialization_alias="toolName",
        )
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
        kind: Literal["text"]
        text: str

    class BodyPiece_KindInsertVal(pydantic.BaseModel):
        kind: Literal["insert-val"]
        val: _internal.Expression
        format: _internal.InsertFormat
        indent: str

    class BodyPiece_KindInsertSnippet(pydantic.BaseModel):
        kind: Literal["insert-snippet"]
        # Snippet name.
        snippet: str
        # Only contains whitespace characters.
        indent: str

    type InsertFormat = Literal[
        "text",
        "json",
        "yaml",
        "toon",
        "csv",
        "tsv",
    ]

    type Expression = Annotated[
        Union[
            _internal.Expression_KindInput,
            _internal.Expression_KindProperty,
        ],
        pydantic.Field(discriminator="kind"),
    ]

    class Expression_KindInput(pydantic.BaseModel):
        kind: Literal["input"]

    class Expression_KindProperty(pydantic.BaseModel):
        kind: Literal["property"]
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
        kind: Literal["snippet"]
        body: list[_internal.BodyPiece]

    class Snippet_KindSnippetIf(pydantic.BaseModel):
        model_config = pydantic.ConfigDict(populate_by_name=True)
        kind: Literal["snippet-if"]
        expression: _internal.Expression
        is_: _internal.Snippet_KindSnippetIf_Is = pydantic.Field(
            validation_alias=pydantic.AliasChoices("is", "is_"),
            serialization_alias="is",
        )
        then: list[_internal.BodyPiece]
        else_: list[_internal.BodyPiece] = pydantic.Field(
            validation_alias=pydantic.AliasChoices("else", "else_"),
            serialization_alias="else",
        )

    type Snippet_KindSnippetIf_Is = Literal[
        "not-null",
        "not-empty",
        "true",
    ]

    class Snippet_KindSnippetSwitch(pydantic.BaseModel):
        kind: Literal["snippet-switch"]
        expression: _internal.Expression
        branches: dict[str, list[_internal.BodyPiece]]

    class Tool(pydantic.BaseModel):
        model_config = pydantic.ConfigDict(populate_by_name=True)
        id: str
        name: str
        description: str
        input_json_schema: Any = pydantic.Field(
            validation_alias=pydantic.AliasChoices(
                "inputJsonSchema", "input_json_schema"
            ),
            serialization_alias="inputJsonSchema",
        )


# </generated:spec>
