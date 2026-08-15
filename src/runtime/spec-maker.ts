import type {
  Body,
  BodyInContext,
  Snippet,
  TemplateContent,
  TemplateContents,
  ValidatedTool,
  ValidCompilationResult,
  ValidTemplate,
} from "../compiler/compiler-types.js";
import { DEFAULT_NAMESPACE } from "../compiler/default-namespace.js";
import type { Expression } from "../expression/expression-types.js";
import type {
  JsonString,
  StrictJsonArray,
  StrictJsonObject,
  StrictJsonValue,
} from "../json/json-types.js";
import { unwrapJsonValue } from "../json/unwrapper.js";
import { toJsonSchema } from "../schema/json-schema-org.js";
import { Schema } from "../schema/schema-types.js";
import * as Spec from "./runtime-types.js";

export function makeTemplates(
  input: ValidCompilationResult,
  options: Options,
): Spec.Templates {
  const tools: { [id: string]: Spec.Tool } = {};
  for (const [id, tool] of Object.entries(input.tools)) {
    tools[id] = makeTool(tool, id, options);
  }
  const templates: { [id: string]: Spec.Template } = {};
  for (const [id, result] of Object.entries(input.templates)) {
    templates[id] = makeTemplate(result, options);
  }
  const sourceFiles = Object.fromEntries(
    Object.entries(input.sourceFiles).map(([path, result]) => [
      path,
      result.content,
    ]),
  );
  const singleNamespace = input.singleNamespace !== null;
  // TODO: set signature
  return { signature: "", tools, templates, singleNamespace, sourceFiles };
}

function makeTool(
  input: ValidatedTool,
  id: string,
  options: Options,
): Spec.Tool {
  const { inputJsonSchema, outputJsonSchema } = makeJsonSchemas(
    input.schema,
    options,
  );
  const { tool } = input;
  return {
    id,
    name: tool.name.text,
    description: tool.description.map((p) => p.text).join(""),
    inputJsonSchema,
    outputJsonSchema,
  };
}

function makeTemplate(input: ValidTemplate, options: Options): Spec.Template {
  const { template } = input;
  const namespace = template.namespace?.text ?? DEFAULT_NAMESPACE;
  const { inputJsonSchema, outputJsonSchema } = makeJsonSchemas(
    input.schema,
    options,
  );
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
    inputJsonSchema,
    outputJsonSchema,
  };
}

function makeContents(
  input: TemplateContents,
  context: { readonly namespace: string },
): Spec.TemplateContents {
  if (input.kind === "no-variants") {
    return { kind: "noVariants", content: makeContent(input.content, context) };
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
    system: input.system ? makeBody(input.system) : undefined,
    user: input.user ? makeBody(input.user) : undefined,
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

function makeBody(input: Body | BodyInContext): Spec.Body {
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
          kind: "insertVal",
          val: makeExpression(piece.val),
          format: piece.format?.text ?? "text",
          indent: piece.indent,
        });
        break;
      }
      case "insert-snippet": {
        pieces.push({
          kind: "insertSnippet",
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

function makeExpression(input: Expression<boolean>): Spec.Expression {
  switch (input.kind) {
    case "input": {
      return { kind: "input" };
    }
    case "property": {
      return {
        kind: "property",
        left: makeExpression(input.left),
        property: input.property.text,
      };
    }
    case "it": {
      return { kind: "input" };
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
      return { kind: "snippet", body: makeBody(input.body) };
    }
    case "snippet-if": {
      return {
        kind: "snippetIf",
        expression: makeExpression(input.expression),
        is: input.is?.text ?? "true",
        then: makeBody(input.then),
        else: makeBody(input.else),
      };
    }
    case "snippet-switch": {
      const branches: { [c: string]: Spec.Body } = {};
      for (const branch of input.branches) {
        branches[branch.case.text] = makeBody(branch.body);
      }
      return {
        kind: "snippetSwitch",
        expression: makeExpression(input.expression),
        branches,
      };
    }
  }
}

function makeJsonSchemas(
  schema: Schema,
  options: {
    readonly includeJsonSchemas: boolean;
  },
): {
  readonly inputJsonSchema: unknown;
  readonly outputJsonSchema: unknown;
} {
  if (options.includeJsonSchemas) {
    return {
      inputJsonSchema: toJsonSchema("Input", schema, schema.unionToMembers),
      outputJsonSchema: toJsonSchema("Output", schema, schema.unionToMembers),
    };
  } else {
    return {
      inputJsonSchema: undefined,
      outputJsonSchema: undefined,
    };
  }
}

type Options = {
  readonly includeJsonSchemas: boolean;
};
