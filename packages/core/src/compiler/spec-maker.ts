import type { Expression } from "../expression/expression-types.js";
import type { StrictJsonValue } from "../json/json-types.js";
import { unwrapJsonValue } from "../json/unwrapper.js";
import { hasRecursiveType } from "../schema/has-recursive-type.js";
import { toJsonSchema } from "../schema/json-schema-org.js";
import { schemaToTypeScript } from "../schema/schema-to-typescript.js";
import type { Schema, TypeDeclaration } from "../schema/schema-types.js";
import { normalizeSchemaValue } from "../schema/value-normalizer.js";
import type {
  Body,
  FewShotExample,
  Snippet,
  TemplateContent,
  TemplateContents,
  ValidCompilationResult,
  ValidTemplate,
  ValidTemplateTool,
  ValidTool,
} from "./compiler-types.js";
import { DEFAULT_NAMESPACE } from "./default-namespace.js";
import type * as Spec from "./spec-types.js";

export function makeTemplates(input: ValidCompilationResult): Spec.Templates {
  const { signature } = input;
  const tools: { [id: string]: Spec.Tool } = {};
  for (const [id, tool] of Object.entries(input.tools)) {
    tools[id] = makeTool(tool, id);
  }
  const templates: { [id: string]: Spec.Template } = {};
  for (const [id, result] of Object.entries(input.templates)) {
    templates[id] = makeTemplate(result);
  }
  const sourceFiles = Object.fromEntries(
    Object.entries(input.sourceFiles).map(([path, result]) => [
      path,
      result.content,
    ]),
  );
  const edition = input.edition;
  return { edition, signature, tools, templates, sourceFiles };
}

export function makeTemplateOverrides(
  input: ValidCompilationResult,
): Spec.Templates {
  const { patchBase } = input;
  if (!patchBase) {
    return {
      edition: input.edition,
      signature: input.signature,
      tools: {},
      templates: {},
      sourceFiles: {},
    };
  }
  const modifiedFiles = Object.fromEntries(
    Object.entries(input.sourceFiles)
      .map(([path, result]): [string, string] => [path, result.content])
      .filter(
        ([path, content]) => patchBase.sourceFiles[path]?.content !== content,
      ),
  );
  const tools: { [id: string]: Spec.Tool } = {};
  for (const [id, tool] of Object.entries(input.tools)) {
    const { path } = tool.tool.name;
    if (!modifiedFiles[path]) continue;
    tools[id] = makeTool(tool, id);
  }
  const templates: { [id: string]: Spec.Template } = {};
  for (const [id, result] of Object.entries(input.templates)) {
    const { path } = result.template.name;
    if (!modifiedFiles[path]) continue;
    templates[id] = makeTemplate(result);
  }
  return {
    edition: input.edition,
    signature: patchBase.signature,
    tools,
    templates,
    sourceFiles: modifiedFiles,
  };
}

function makeTool(input: ValidTool, id: string): Spec.Tool {
  const { inputJsonSchema } = makeJsonSchemas(input.schema);
  const { tool } = input;
  return {
    id,
    name: tool.name.text,
    description: tool.description.map((p) => p.text).join(""),
    inputJsonSchema,
  };
}

type TemplateContext = {
  readonly namespace: string;
  readonly schema: Schema;
  readonly inputType: TypeDeclaration;
  readonly outputType: TypeDeclaration;
  readonly tools: { readonly [name: string]: ValidTemplateTool };
  readonly variantCase: string | null;
};

function makeTemplate(input: ValidTemplate): Spec.Template {
  const { inputType, outputFormat, outputType, schema, template, tools } =
    input;
  const namespace = template.namespace?.text ?? DEFAULT_NAMESPACE;
  const { outputJsonSchema } = makeJsonSchemas(schema);
  const outputHasRecursiveType = hasRecursiveType(schema, "Output");
  return {
    name: template.name.text,
    namespace,
    outputFormat:
      outputFormat === "json"
        ? {
            format: "json",
            jsonSchema: outputJsonSchema as {
              readonly [k: string]: unknown;
            },
            typescriptSchema: schemaToTypeScript("Output", schema),
            hasRecursiveType: outputHasRecursiveType,
          }
        : {
            format: "text",
          },
    tools: Object.entries(tools).map(([name, { tool }]) => ({
      id: namespace.concat(":", tool.tool.name.text),
      name,
    })),
    contents: makeContents(template.contents, {
      namespace,
      schema,
      inputType,
      outputType,
      tools,
      variantCase: null,
    }),
    snippets: makeSnippets(template.snippets),
    outputJsonSchema,
    outputHasRecursiveType,
  };
}

function makeContents(
  input: TemplateContents,
  context: TemplateContext,
): Spec.TemplateContents {
  if (input.kind === "no-variants") {
    return {
      kind: "no-variants",
      content: makeContent(input.content, context),
    };
  } else {
    const variants: { [c: string]: Spec.TemplateContent } = {};
    for (const variant of input.variants) {
      variants[variant.case.text] = makeContent(variant.content, {
        ...context,
        variantCase: variant.case.text,
      });
    }
    return {
      kind: "variants",
      variants,
      defaultContent: makeContent(input.defaultContent, context),
    };
  }
}

function makeContent(
  input: Partial<TemplateContent>,
  context: TemplateContext,
): Spec.TemplateContent {
  return {
    meta: input.meta ? unwrapJsonValue(input.meta.value) : undefined,
    system: input.system ? makeBody(input.system, {}) : undefined,
    user: input.user ? makeBody(input.user, {}) : undefined,
    examples: makeExamples(input.examples, context),
  };
}

function makeExamples(
  input: StrictJsonValue | undefined,
  context: TemplateContext,
): readonly Spec.FewShotExample[] {
  if (!input) return [];

  const inputType = context.inputType.valueType;
  const outputType = context.outputType.valueType;
  const examples = unwrapJsonValue(input) as readonly FewShotExample[];
  return examples.map((example) => {
    const rawInputValue = example.input;
    if (context.variantCase) {
      (rawInputValue as Record<string, unknown>).variant = context.variantCase;
    }
    const inputValue = normalizeSchemaValue(
      rawInputValue,
      {
        type: inputType,
        schema: context.schema,
      },
      "user",
    );
    const outputValue = normalizeSchemaValue(
      example.output,
      {
        type: outputType,
        schema: context.schema,
      },
      "assistant",
    );

    return {
      input: inputValue,
      output: outputValue,
      steps:
        example.steps?.map((step) => ({
          toolCalls: step.toolCalls.map((tc) => {
            const tool = context.tools[tc.tool]!.tool;
            const toolInputType = tool.inputType.valueType;
            const toolOutputType = tool.outputType.valueType;
            const inputVal = normalizeSchemaValue(
              tc.input,
              {
                type: toolInputType,
                schema: tool.schema,
              },
              "assistant",
            );
            const outputVal = normalizeSchemaValue(
              tc.output,
              {
                type: toolOutputType,
                schema: tool.schema,
              },
              "user",
            );
            return {
              callId: tc.callId,
              toolId: context.namespace.concat(":", tc.tool),
              toolName: tc.tool,
              input: inputVal,
              output: outputVal,
            };
          }),
        })) ?? [],
    };
  });
}

type ValContext<HasValContext extends boolean> = HasValContext extends true
  ? { it: Spec.Expression }
  : { it?: undefined };

function makeBody<HasValContext extends boolean>(
  input: Body<HasValContext>,
  context: ValContext<HasValContext>,
): Spec.Body {
  const pieces: Spec.BodyPiece[] = [];
  for (const piece of input) {
    switch (piece.kind) {
      case "text":
      case "c-tag": {
        pieces.push({ kind: "text", text: piece.text });
        break;
      }
      case "insert-val": {
        pieces.push({
          kind: "insert-val",
          val: makeExpression(piece.val, context),
          format: piece.format?.text ?? "text",
          indent: piece.indent,
        });
        break;
      }
      case "insert-snippet": {
        pieces.push({
          kind: "insert-snippet",
          snippet: piece.snippet.text,
          indent: piece.indent,
        });
        break;
      }
      case "insert-schema": {
        break;
      }
      default: {
        const _: never = piece;
        throw new Error(_);
      }
    }
  }
  return pieces;
}

function makeExpression<HasValContext extends boolean>(
  input: Expression<HasValContext>,
  context: HasValContext extends true
    ? { it: Spec.Expression }
    : { it?: undefined },
): Spec.Expression {
  switch (input.kind) {
    case "input": {
      return { kind: "input" };
    }
    case "property": {
      return {
        kind: "property",
        left: makeExpression(input.left, context),
        property: input.property.text,
      };
    }
    case "it": {
      return context.it!;
    }
  }
}

function makeSnippets(input: readonly Snippet[]): {
  [name: string]: Spec.Snippet;
} {
  const result: { [name: string]: Spec.Snippet } = {};
  for (const snippet of input) {
    result[snippet.name.text] = makeSnippet(snippet);
  }
  return result;
}

function makeSnippet(input: Snippet): Spec.Snippet {
  switch (input.kind) {
    case "snippet": {
      return { kind: "snippet", body: makeBody(input.body, {}) };
    }
    case "snippet-if": {
      const expression = makeExpression(input.expression, {});
      const is = ((): "true" | "not-null" | "not-empty" => {
        switch (input.is?.text ?? "true") {
          case "true":
            return "true";
          case "notNull":
            return "not-null";
          case "notEmpty":
            return "not-empty";
        }
      })();
      return {
        kind: "snippet-if",
        expression,
        is,
        then: makeBody(input.then, { it: expression }),
        else: makeBody(input.else, { it: expression }),
      };
    }
    case "snippet-switch": {
      const branches: { [c: string]: Spec.Body } = {};
      for (const branch of input.branches) {
        branches[branch.case.text] = makeBody(branch.body, {});
      }
      const expression = makeExpression(input.expression, {});
      return {
        kind: "snippet-switch",
        expression,
        branches,
      };
    }
  }
}

function makeJsonSchemas(schema: Schema): {
  readonly inputJsonSchema: unknown;
  readonly outputJsonSchema: unknown;
} {
  return {
    inputJsonSchema: toJsonSchema("Input", schema, schema.unionToMembers),
    outputJsonSchema: toJsonSchema("Output", schema, schema.unionToMembers),
  };
}
