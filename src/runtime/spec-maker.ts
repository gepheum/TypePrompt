import type {
  Body,
  BodyInContext,
  CompilationResult,
  Snippet,
  Template,
  TemplateContent,
  TemplateContents,
} from "../compiler/compiler-types.js";
import type { Expression } from "../expression/expression-types.js";
import type { JsonValue } from "../json/json-types.js";
import * as Spec from "./runtime-types.js";

export function makeTemplates(input: CompilationResult): Spec.Templates {
  const templates: { [id: string]: Spec.Template } = {};
  for (const [id, result] of Object.entries(input.templates)) {
    if (result.kind !== "success") continue;
    templates[id] = makeTemplate(result.template);
  }
  // TODO: set signature
  return { signature: "", templates };
}

function makeTemplate(input: Template): Spec.Template {
  return {
    name: input.name.text,
    namespace: input.namespace?.text ?? "Default",
    outputFormat: input.outputFormat?.text ?? "text",
    contents: makeContents(input.contents),
    snippets: makeSnippets(input.snippets),
  };
}

function makeContents(input: TemplateContents): Spec.TemplateContents {
  if (input.kind === "no-variants") {
    return { kind: "noVariants", content: makeContent(input.content) };
  } else {
    const variants: { [c: string]: Spec.TemplateContent } = {};
    for (const variant of input.variants) {
      variants[variant.case.text] = makeContent(variant.content);
    }
    return {
      kind: "variants",
      variants,
      defaultContent: makeContent(input.defaultContent),
    };
  }
}

function makeContent(input: Partial<TemplateContent>): Spec.TemplateContent {
  return {
    meta: input.meta ? makeValue(input.meta.value) : undefined,
    system: input.system ? makeBody(input.system) : undefined,
    user: input.user ? makeBody(input.user) : undefined,
    examples: input.examples
      ? (makeValue(input.examples) as readonly {
          readonly input: unknown;
          readonly output: unknown;
        }[])
      : [],
  };
}

function makeValue(input: JsonValue<"strict">): unknown {
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
      const result: { [key: string]: unknown } = {};
      for (const entry of input.entries) {
        result[entry.key.value] = makeValue(entry.value);
      }
      return result;
    }
    case "array":
      return input.elements.map(makeValue);
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

function makeSnippets(
  input: readonly Snippet[],
): { [name: string]: Spec.Snippet } {
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

