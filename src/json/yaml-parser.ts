import type { Scalar, YAMLMap, YAMLSeq } from "yaml";
import { isMap, isScalar, isSeq, parseDocument } from "yaml";
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

  if (doc.errors.length > 0) {
    return {
      kind: "error",
      errors: doc.errors.map((err) => ({
        span: {
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
        start: textToSourcePosition(content, 0),
        end: textToSourcePosition(content, content.text.length),
      },
      message: "Unsupported YAML node type",
    });
  }

  return result;
}

/// Maps a decoded YAML offset to a source offset, safely extrapolating for
/// positions that the YAML library may report one past the end of the input.
function mapOffset(content: MappedText, offset: number): number {
  const clamped = Math.min(offset, content.text.length);
  return textToSourcePosition(content, clamped) + (offset - clamped);
}

function span(content: MappedText, start: number, end: number): TextSpan {
  return {
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

  if (value === null || value === undefined) {
    return { kind: "null", firstToken };
  } else if (typeof value === "boolean") {
    return { kind: "boolean", firstToken, value };
  } else if (typeof value === "number") {
    return { kind: "number", firstToken, value };
  } else if (typeof value === "bigint") {
    return { kind: "number", firstToken, value: Number(value) };
  } else if (value instanceof Date) {
    return { kind: "string", firstToken, value: value.toISOString() };
  } else {
    return { kind: "string", firstToken, value: String(value) };
  }
}

function scalarToJsonString(node: Scalar, content: MappedText): JsonString {
  const [start, end] = node.range ?? [0, 0, 0];
  return {
    kind: "string",
    firstToken: span(content, start, end),
    value: String(node.value ?? ""),
  };
}
