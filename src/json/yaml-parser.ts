import type { Scalar, YAMLMap, YAMLSeq } from "yaml";
import { isMap, isScalar, isSeq, parseDocument } from "yaml";
import type { InternalErrors } from "../util/error-types.js";
import type { JsonObjectEntry, JsonString, JsonValue } from "./json-types.js";

export function parseYaml(
  source: string,
): JsonValue<"strict"> | InternalErrors {
  const doc = parseDocument(source, { logLevel: "silent" });

  if (doc.errors.length > 0) {
    return {
      kind: "error",
      errors: doc.errors.map((err) => ({
        start: err.pos[0],
        end: err.pos[1],
        message: err.message,
      })),
    };
  }

  if (doc.contents === null || doc.contents === undefined) {
    return {
      kind: "error",
      errors: [{ start: 0, end: 0, message: "Empty YAML document" }],
    };
  }

  const result = convertNode(doc.contents, source);
  if (result === null) {
    return {
      kind: "error",
      errors: [
        { start: 0, end: source.length, message: "Unsupported YAML node type" },
      ],
    };
  }

  return result;
}

function span(source: string, start: number, end: number) {
  return { text: source.slice(start, end), start, end };
}

function convertNode(
  node: unknown,
  source: string,
): JsonValue<"strict"> | null {
  if (isMap(node)) {
    return convertMap(node, source);
  } else if (isSeq(node)) {
    return convertSeq(node, source);
  } else if (isScalar(node)) {
    return convertScalar(node, source);
  } else {
    return null;
  }
}

function convertMap(node: YAMLMap, source: string): JsonValue<"strict"> {
  const [start] = node.range ?? [0, 0, 0];
  const entries: JsonObjectEntry<"strict">[] = [];

  for (const pair of node.items) {
    if (!isScalar(pair.key)) continue;

    const key = scalarToJsonString(pair.key, source);

    let value: JsonValue<"strict">;
    if (isScalar(pair.value)) {
      value = convertScalar(pair.value, source);
    } else if (isMap(pair.value)) {
      value = convertMap(pair.value, source);
    } else if (isSeq(pair.value)) {
      value = convertSeq(pair.value, source);
    } else {
      // null / missing value: use a zero-width span right after the key token
      const keyEnd = pair.key.range?.[1] ?? start;
      value = { kind: "null", firstToken: span(source, keyEnd, keyEnd) };
    }

    entries.push({ key, value });
  }

  return {
    kind: "object",
    firstToken: span(source, start, start + 1),
    entries,
  };
}

function convertSeq(node: YAMLSeq, source: string): JsonValue<"strict"> {
  const [start] = node.range ?? [0, 0, 0];
  const elements: JsonValue<"strict">[] = [];

  for (const item of node.items) {
    const converted = convertNode(item, source);
    if (converted !== null) elements.push(converted);
  }

  return {
    kind: "array",
    firstToken: span(source, start, start + 1),
    elements,
  };
}

function convertScalar(node: Scalar, source: string): JsonValue<"strict"> {
  const [start, end] = node.range ?? [0, 0, 0];
  const firstToken = span(source, start, end);
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

function scalarToJsonString(node: Scalar, source: string): JsonString {
  const [start, end] = node.range ?? [0, 0, 0];
  return {
    kind: "string",
    firstToken: span(source, start, end),
    value: String(node.value ?? ""),
  };
}
