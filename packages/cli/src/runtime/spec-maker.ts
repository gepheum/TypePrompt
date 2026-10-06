import type {
  Body,
  Snippet,
  TemplateContent,
  TemplateContents,
  ValidatedTool,
  ValidCompilationResult,
  ValidTemplate,
} from "@typeprompt/core/compiler/compiler-types.js";
import { DEFAULT_NAMESPACE } from "@typeprompt/core/compiler/default-namespace.js";
import type { Expression } from "@typeprompt/core/expression/expression-types.js";
import type {
  JsonString,
  StrictJsonArray,
  StrictJsonObject,
  StrictJsonValue,
} from "@typeprompt/core/json/json-types.js";
import { unwrapJsonValue } from "@typeprompt/core/json/unwrapper.js";
import { toJsonSchema } from "@typeprompt/core/schema/json-schema-org.js";
import type { Schema } from "@typeprompt/core/schema/schema-types.js";
import type * as Spec from "./runtime-types.js";

export function makeTemplates(input: ValidCompilationResult): Spec.Templates {
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
  const singleNamespace = input.singleNamespace !== null;
  const edition = 0;
  const signature = crypto.randomUUID();
  return { edition, signature, tools, templates, singleNamespace, sourceFiles };
}

function makeTool(input: ValidatedTool, id: string): Spec.Tool {
  const { inputJsonSchema } = makeJsonSchemas(input.schema);
  const { tool } = input;
  return {
    id,
    name: tool.name.text,
    description: tool.description.map((p) => p.text).join(""),
    inputJsonSchema,
  };
}

function makeTemplate(input: ValidTemplate): Spec.Template {
  const { template } = input;
  const namespace = template.namespace?.text ?? DEFAULT_NAMESPACE;
  const { outputJsonSchema } = makeJsonSchemas(input.schema);
  return {
    name: template.name.text,
    namespace: namespace,
    outputFormat: template.outputFormat?.text ?? "json",
    tools: Object.entries(input.tools).map(([name, { tool }]) => ({
      id: namespace.concat(":", tool.tool.name.text),
      name,
    })),
    contents: makeContents(template.contents, { namespace: namespace }),
    snippets: makeSnippets(template.snippets),
    outputJsonSchema,
  };
}

function makeContents(
  input: TemplateContents,
  context: { readonly namespace: string },
): Spec.TemplateContents {
  if (input.kind === "no-variants") {
    return {
      kind: "no-variants",
      content: makeContent(input.content, context),
    };
  } else {
    const variants: { [c: string]: Spec.TemplateContent } = {};
    for (const variant of input.variants) {
      variants[variant.case.text] = makeContent(variant.content, context);
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
  context: { readonly namespace: string },
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
  context: { readonly namespace: string },
): readonly Spec.FewShotExample[] {
  if (!input) return [];

  const makeToolCall = (input: StrictJsonValue): Spec.ToolCallExample => {
    const { entries } = input as StrictJsonObject;
    const callIdEntry = entries["callId"]!;
    const toolEntry = entries["tool"]!;
    const inputEntry = entries["input"]!;
    const outputEntry = entries["output"]!;
    const toolName = (toolEntry.value as JsonString).value;
    const toolId = context.namespace.concat(":", toolName);
    return {
      callId: (callIdEntry.value as JsonString).value,
      toolId,
      toolName,
      input: unwrapJsonValue(inputEntry.value),
      output: unwrapJsonValue(outputEntry.value),
    };
  };

  const makeIntermediateStep = (
    input: StrictJsonValue,
  ): {
    readonly toolCalls: readonly Spec.ToolCallExample[];
  } => {
    const { entries } = input as StrictJsonObject;
    const toolCallsEntry = entries["toolCalls"];
    return {
      toolCalls: (toolCallsEntry?.value as StrictJsonArray).elements.map(
        makeToolCall,
      ),
    };
  };

  const makeExample = (input: StrictJsonValue): Spec.FewShotExample => {
    const { entries } = input as StrictJsonObject;
    const inputEntry = entries["input"]!;
    const outputEntry = entries["output"]!;
    const intermediateSteps = entries["intermediateSteps"];
    return {
      input: unwrapJsonValue(inputEntry.value),
      output: unwrapJsonValue(outputEntry.value),
      intermediateSteps: intermediateSteps
        ? (intermediateSteps.value as StrictJsonArray).elements.map(
            makeIntermediateStep,
          )
        : [],
    };
  };

  return (input as StrictJsonArray).elements.map(makeExample);
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
