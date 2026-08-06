import type {
  Body,
  BodyInContext,
  CompilationResult,
  Snippet,
  TemplateContent,
  TemplateContents,
  Tool,
  ValidatedTemplate,
} from "../compiler/compiler-types.js";
import type { Expression } from "../expression/expression-types.js";
import type {
  JsonString,
  StrictJsonArray,
  StrictJsonObject,
  StrictJsonValue,
} from "../json/json-types.js";
import * as Spec from "./runtime-types.js";

export function makeTemplates(input: CompilationResult): Spec.Templates {
  const tools: { [id: string]: Spec.Tool } = {};
  for (const [id, result] of Object.entries(input.tools)) {
    if (result.kind !== "success") continue;
    tools[id] = makeTool(id, result.tool);
  }
  const templates: { [id: string]: Spec.Template } = {};
  for (const [id, result] of Object.entries(input.templates)) {
    if (result.kind !== "success") continue;
    templates[id] = makeTemplate(result);
  }
  // TODO: set signature
  return { signature: "", tools, templates };
}

function makeTool(id: string, input: Tool): Spec.Tool {
  return {
    id,
    name: input.name.text,
    description: input.description
      .filter((p) => p.kind === "text")
      .map((p) => p.text)
      .join(""),
  };
}

function makeTemplate(result: ValidatedTemplate): Spec.Template {
  const { template } = result;
  const namespace = template.namespace?.text ?? "Default";
  return {
    name: template.name.text,
    namespace: namespace,
    outputFormat: template.outputFormat?.text ?? "text",
    tools: Object.entries(result.tools).map(([name, { tool }]) => ({
      id:
        tool.kind === "success"
          ? `${tool.tool.namespace?.text ?? "Default"}:${tool.tool.name.text}`
          : name,
      name,
    })),
    contents: makeContents(template.contents, { namespace: namespace }),
    snippets: makeSnippets(template.snippets),
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

function unwrapJsonValue(input: StrictJsonValue): unknown {
  switch (input.kind) {
    case "string":
      return input.value;
    case "number":
      return input.value;
    case "boolean":
      return input.value;
    case "null":
      return null;
    case "object": {
      return Object.fromEntries(
        Object.entries(input.entries).map(([key, entry]) => [
          key,
          unwrapJsonValue(entry.value),
        ]),
      );
    }
    case "array":
      return input.elements.map(unwrapJsonValue);
  }
}

function makeBody(input: Body | BodyInContext): Spec.Body {
  const pieces: Spec.BodyPiece[] = [];
  for (const piece of input) {
    switch (piece.kind) {
      case "text": {
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
      // "c-tag" is a compilation artifact; not needed at runtime
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
