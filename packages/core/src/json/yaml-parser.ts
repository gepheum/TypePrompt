import type { CST, Scalar, YAMLMap, YAMLSeq } from "yaml";
import {
  isMap,
  isScalar,
  isSeq,
  parseAllDocuments,
  parseDocument,
  Parser,
  visit,
} from "yaml";
import type { SemanticToken } from "../lsp-util/semantic-token.js";
import { makeSingletonErrors } from "../util/errors.js";
import { textToSourcePosition } from "../util/position-mapper.js";
import type {
  InternalErrors,
  MappedText,
  TextSpan,
} from "../util/shared-types.js";
import type {
  JsonObjectEntry,
  JsonString,
  StrictJsonValue,
} from "./json-types.js";

export function parseYaml(
  content: MappedText,
): StrictJsonValue | InternalErrors {
  const doc = parseDocument(content.text, { logLevel: "silent" });

  if (doc.errors.length >= 1) {
    return {
      kind: "error",
      errors: doc.errors.map((err) => ({
        span: {
          path: content.path,
          start: mapOffset(content, err.pos[0]),
          end: mapOffset(content, err.pos[1]),
        },
        message: err.message,
      })),
    };
  }

  if (doc.contents === null || doc.contents === undefined) {
    return makeSingletonErrors({
      span: {
        path: content.path,
        start: textToSourcePosition(content, 0),
        end: textToSourcePosition(content, 0),
      },
      message: "Empty YAML document",
    });
  }

  const result = convertNode(doc.contents, content);
  if (result === null) {
    return makeSingletonErrors({
      span: {
        path: content.path,
        start: textToSourcePosition(content, 0),
        end: textToSourcePosition(content, content.text.length),
      },
      message: "Unsupported YAML node type",
    });
  }

  return result;
}

/**
 * Tokenizes YAML content into semantic tokens for syntax highlighting.
 * Used by the language server.
 */
export function tokenizeYaml(content: MappedText): readonly SemanticToken[] {
  const result: SemanticToken[] = [];

  // Collect comments using the CST Parser
  const parser = new Parser();
  for (const token of parser.parse(content.text)) {
    collectComments(token, result, content);
  }

  // Collect semantic tokens for scalars (strings, numbers, booleans)
  const docs = parseAllDocuments(content.text, { logLevel: "silent" });
  for (const doc of docs) {
    visit(doc, {
      Scalar(key, node) {
        if (!node.range) return;
        const [start, valueEnd] = node.range;
        const val = node.value;
        if (typeof val === "boolean" && key !== "key") {
          result.push({
            kind: "boolean",
            span: {
              path: content.path,
              start: mapOffset(content, start),
              end: mapOffset(content, valueEnd),
            },
          });
        } else if (
          (typeof val === "number" || typeof val === "bigint") &&
          key !== "key"
        ) {
          result.push({
            kind: "number",
            span: {
              path: content.path,
              start: mapOffset(content, start),
              end: mapOffset(content, valueEnd),
            },
          });
        } else if (typeof val === "string") {
          if (
            key !== "key" ||
            node.type === "QUOTE_DOUBLE" ||
            node.type === "QUOTE_SINGLE"
          ) {
            result.push({
              kind: "string",
              span: {
                path: content.path,
                start: mapOffset(content, start),
                end: mapOffset(content, valueEnd),
              },
            });
          }
        }
      },
    });
  }

  result.sort((a, b) => a.span.start - b.span.start);
  return result;
}

function collectComments(
  token: CST.Token | CST.SourceToken | CST.CollectionItem | null | undefined,
  tokens: SemanticToken[],
  content: MappedText,
): void {
  if (!token) return;
  if ("type" in token) {
    if (token.type === "comment") {
      tokens.push({
        kind: "comment",
        span: {
          path: content.path,
          start: mapOffset(content, token.offset),
          end: mapOffset(content, token.offset + token.source.length),
        },
      });
      return;
    }
    switch (token.type) {
      case "document": {
        for (const t of token.start) collectComments(t, tokens, content);
        if (token.value) collectComments(token.value, tokens, content);
        if (token.end) {
          for (const t of token.end) collectComments(t, tokens, content);
        }
        break;
      }
      case "doc-end":
      case "alias":
      case "scalar":
      case "single-quoted-scalar":
      case "double-quoted-scalar": {
        if (token.end) {
          for (const t of token.end) collectComments(t, tokens, content);
        }
        break;
      }
      case "block-scalar": {
        for (const t of token.props) collectComments(t, tokens, content);
        break;
      }
      case "block-map":
      case "block-seq": {
        for (const item of token.items) {
          collectComments(item, tokens, content);
        }
        break;
      }
      case "flow-collection": {
        collectComments(token.start, tokens, content);
        for (const item of token.items) {
          collectComments(item, tokens, content);
        }
        for (const t of token.end) collectComments(t, tokens, content);
        break;
      }
    }
  } else {
    for (const t of token.start) collectComments(t, tokens, content);
    if (token.key) collectComments(token.key, tokens, content);
    if (token.sep) {
      for (const t of token.sep) collectComments(t, tokens, content);
    }
    if (token.value) collectComments(token.value, tokens, content);
  }
}

/**
 * Maps a decoded YAML offset to a source offset, safely extrapolating for
 * positions that the YAML library may report one past the end of the input.
 */
function mapOffset(content: MappedText, offset: number): number {
  const clamped = Math.min(offset, content.text.length);
  return textToSourcePosition(content, clamped) + (offset - clamped);
}

function span(content: MappedText, start: number, end: number): TextSpan {
  return {
    path: content.path,
    text: content.text.slice(start, end),
    start: textToSourcePosition(content, start),
    end: textToSourcePosition(content, end),
  };
}

function convertNode(
  node: unknown,
  content: MappedText,
): StrictJsonValue | null {
  if (isMap(node)) {
    return convertMap(node, content);
  } else if (isSeq(node)) {
    return convertSeq(node, content);
  } else if (isScalar(node)) {
    return convertScalar(node, content);
  } else {
    return null;
  }
}

function convertMap(node: YAMLMap, content: MappedText): StrictJsonValue {
  const [start] = node.range ?? [0, 0, 0];
  const entries: { [key: string]: JsonObjectEntry<"strict"> } = {};

  for (const pair of node.items) {
    if (!isScalar(pair.key)) continue;

    const key = scalarToJsonString(pair.key, content);

    let value: StrictJsonValue;
    if (isScalar(pair.value)) {
      value = convertScalar(pair.value, content);
    } else if (isMap(pair.value)) {
      value = convertMap(pair.value, content);
    } else if (isSeq(pair.value)) {
      value = convertSeq(pair.value, content);
    } else {
      // null / missing value: use a zero-width span right after the key token
      const keyEnd = pair.key.range?.[1] ?? start;
      value = { kind: "null", firstToken: span(content, keyEnd, keyEnd) };
    }

    entries[key.value] = { key, value };
  }

  return {
    kind: "object",
    firstToken: span(content, start, start + 1),
    entries,
  };
}

function convertSeq(node: YAMLSeq, content: MappedText): StrictJsonValue {
  const [start] = node.range ?? [0, 0, 0];
  const elements: StrictJsonValue[] = [];

  for (const item of node.items) {
    const converted = convertNode(item, content);
    if (converted !== null) elements.push(converted);
  }

  return {
    kind: "array",
    firstToken: span(content, start, start + 1),
    elements,
  };
}

function convertScalar(node: Scalar, content: MappedText): StrictJsonValue {
  const [start, end] = node.range ?? [0, 0, 0];
  const firstToken = span(content, start, end);
  const value = node.value;
  const quoted = node.type === "QUOTE_DOUBLE" || node.type === "QUOTE_SINGLE";

  if (value === null || value === undefined) {
    return { kind: "null", firstToken };
  } else if (typeof value === "boolean") {
    return { kind: "boolean", firstToken, value };
  } else if (typeof value === "number") {
    return { kind: "number", firstToken, value };
  } else if (typeof value === "bigint") {
    return { kind: "number", firstToken, value: Number(value) };
  } else if (value instanceof Date) {
    return { kind: "string", firstToken, value: value.toISOString(), quoted };
  } else {
    return { kind: "string", firstToken, value: String(value), quoted };
  }
}

function scalarToJsonString(node: Scalar, content: MappedText): JsonString {
  const [start, end] = node.range ?? [0, 0, 0];
  const quoted = node.type === "QUOTE_DOUBLE" || node.type === "QUOTE_SINGLE";
  return {
    kind: "string",
    firstToken: span(content, start, end),
    value: String(node.value ?? ""),
    quoted,
  };
}
