import type {
  ResolvedType,
  Schema,
  SyntheticType,
  TypeDeclaration,
} from "../schema/schema-types.js";
import { resolveType } from "../schema/type-resolver.js";
import type { InternalError, Span } from "../util/shared-types.js";
import type { JsonTypeMatch, JsonValue } from "./json-types.js";

export function validateJson(
  json: JsonValue<"strict">,
  schema: Schema,
  type: TypeDeclaration | SyntheticType,
): InternalError[] {
  const result = jsonMatchesType(
    json as JsonValue<"loose">,
    resolveType(type, schema),
    "thorough",
    schema,
  );
  if (result.kind === "match") {
    return [];
  }
  const getTypeName = (t: TypeDeclaration | SyntheticType): string => {
    return t.kind === "synthetic-array"
      ? getTypeName(t.elementType).concat("[]")
      : t.name.text;
  };
  const typeName = getTypeName(type);
  const errors: InternalError[] = [
    {
      span: {
        start: json.firstToken.start,
        end: json.firstToken.end,
      },
      message: `Does not match type '${typeName}'`,
    },
  ];
  if (result.details !== undefined && result.details.matchScore >= 0.5) {
    errors.push(result.details.reason);
  }
  return errors;
}

export function jsonMatchesType(
  value: JsonValue<"loose">,
  type: ResolvedType | SyntheticType,
  mode: "fast" | "thorough",
  schema: Schema,
): JsonTypeMatch {
  if (value.kind === "ellipsis") {
    return MATCH;
  }
  switch (type.kind) {
    case "array":
    case "synthetic-array": {
      if (value.kind === "array") {
        const elementType = resolveType(type.elementType, schema);
        let matchScoreTotal = 0.0;
        const { elements } = value;
        for (const element of elements) {
          const elementMatch = jsonMatchesType(
            element,
            elementType,
            mode,
            schema,
          );
          if (elementMatch.kind === "match") {
            matchScoreTotal += 1.0;
          } else if (elementMatch.kind === "mismatch") {
            if (mode === "fast") {
              return FAST_MISMATCH;
            } else {
              const details = elementMatch.details!;
              matchScoreTotal += details.matchScore;
              return {
                kind: "mismatch",
                details: {
                  reason: details.reason,
                  matchScore: matchScoreTotal / elements.length,
                },
              };
            }
          }
        }
        return MATCH;
      } else {
        return mismatch(
          mode,
          value.firstToken,
          `Expected array but got ${value.kind}`,
        );
      }
    }
    case "primitive": {
      if (value.kind === type.primitive) {
        return MATCH;
      } else if (value.kind === "number" && type.primitive === "integer") {
        if (
          Number.isInteger(value.value) &&
          -2147483648 <= value.value &&
          value.value <= 2147483647
        ) {
          return MATCH;
        } else {
          return mismatch(
            mode,
            value.firstToken,
            `Expected int but got float`,
            0.5,
          );
        }
      } else {
        return mismatch(
          mode,
          value.firstToken,
          `Expected ${type.primitive} but got ${value.kind}`,
        );
      }
    }
    case "interface":
    case "synthetic-interface": {
      if (value.kind === "object") {
        const requiredFields = Object.values(type.fields).filter(
          (field) => !field.optional,
        );
        if (
          value.entries.length === 0 &&
          (requiredFields.length === 0 || value.ellipsis)
        ) {
          // To avoid a division by zero later.
          return MATCH;
        }
        let matchScoreTotal = 0.0;
        let firstMismatchReason: InternalError | undefined;
        const seenFieldNames = new Set<string>();
        for (const entry of value.entries) {
          const fieldName = entry.key.value;
          seenFieldNames.add(fieldName);
          const field = type.fields[fieldName];
          if (field) {
            const fieldType = resolveType(field.type, schema);
            const fieldMatch = jsonMatchesType(
              entry.value,
              fieldType,
              mode,
              schema,
            );
            if (fieldMatch.kind === "match") {
              matchScoreTotal += 1.0;
            } else {
              const _: "mismatch" = fieldMatch.kind;
              if (mode === "fast") {
                return FAST_MISMATCH;
              } else {
                firstMismatchReason ??= fieldMatch.details!.reason;
                matchScoreTotal += fieldMatch.details!.matchScore;
              }
            }
          } else {
            // Field present in the object but not defined in the interface.
            if (mode === "fast") {
              return FAST_MISMATCH;
            } else {
              firstMismatchReason ??= {
                span: {
                  start: entry.key.firstToken.start,
                  end: entry.key.firstToken.end,
                },
                message: `Unknown field '${fieldName}'`,
              };
            }
          }
        }
        // We've gone over all the entries of the JSON object, now check that all the
        // required fields are present.
        if (!value.ellipsis) {
          for (const field of requiredFields) {
            const fieldName = field.name.text;
            if (seenFieldNames.has(fieldName)) {
              matchScoreTotal += 1.0;
            } else {
              firstMismatchReason ??= {
                span: {
                  start: value.firstToken.start,
                  end: value.firstToken.end,
                },
                message: `Missing required field '${fieldName}'`,
              };
            }
          }
        }
        if (firstMismatchReason) {
          const divisor = requiredFields.length + value.entries.length;
          return {
            kind: "mismatch",
            details: {
              reason: firstMismatchReason,
              matchScore: matchScoreTotal / divisor,
            },
          };
        } else {
          return MATCH;
        }
      } else {
        return mismatch(
          mode,
          value.firstToken,
          `Expected object but got ${value.kind}`,
        );
      }
    }
    case "record": {
      if (value.kind === "object") {
        const valueType = resolveType(type.valueType, schema);
        let matchScoreTotal = 0.0;
        for (const entry of value.entries) {
          const valueMatch = jsonMatchesType(
            entry.value,
            valueType,
            mode,
            schema,
          );
          if (valueMatch.kind === "match") {
            matchScoreTotal += 1.0;
          } else if (valueMatch.kind === "mismatch") {
            if (mode === "fast") {
              return FAST_MISMATCH;
            } else {
              const details = valueMatch.details!;
              matchScoreTotal += details.matchScore;
              return {
                kind: "mismatch",
                details: {
                  reason: details.reason,
                  matchScore: matchScoreTotal / value.entries.length,
                },
              };
            }
          }
        }
        return MATCH;
      } else {
        return mismatch(
          mode,
          value.firstToken,
          `Expected object but got ${value.kind}`,
        );
      }
    }
    case "string-literal": {
      if (value.kind === "string") {
        if (value.value === type.value) {
          return MATCH;
        } else {
          // Not the right string.
          return mismatch(mode, value.firstToken, `Expected "${type.value}"`);
        }
      } else {
        // Not a string.
        return mismatch(
          mode,
          value.firstToken,
          `Expected string but got ${value.kind}`,
        );
      }
    }
    case "union": {
      const members = schema.unionToMembers.get(type)!;
      switch (members.kind) {
        case "strings": {
          if (value.kind === "string") {
            if (members.values.has(value.value)) {
              return MATCH;
            } else {
              return mismatch(
                mode,
                value.firstToken,
                "Not found in union type",
                0.5,
              );
            }
          } else {
            // Not a string.
            return mismatch(
              mode,
              value.firstToken,
              `Expected string but got ${value.kind}`,
            );
          }
        }
        case "interfaces": {
          if (value.kind === "object") {
            if (value.entries.length <= 0 && value.ellipsis) {
              return MATCH;
            }
            const { discriminator } = members;
            const kindValue = value.entries.find(
              (e) => e.key.value === discriminator,
            );
            if (kindValue) {
              if (kindValue.value.kind === "string") {
                const member = members.members[kindValue.value.value];
                if (member) {
                  return jsonMatchesType(value, member, mode, schema);
                } else {
                  // No matching member for the kind value in the union.
                  return mismatch(
                    mode,
                    kindValue.value.firstToken,
                    `No matching member for value "${kindValue.value.value}"`,
                    0.5,
                  );
                }
              } else {
                // Kind value is not a string.
                return mismatch(
                  mode,
                  kindValue.value.firstToken,
                  "Expected string but got " + kindValue.value.kind,
                );
              }
            } else {
              // Kind field not found.
              return mismatch(
                mode,
                value.firstToken,
                `Missing required field '${discriminator}'`,
              );
            }
          } else {
            // Not an object.
            return mismatch(
              mode,
              value.firstToken,
              `Expected object but got ${value.kind}`,
            );
          }
        }
      }
    }
  }
}

const MATCH = { kind: "match" } as const;
const FAST_MISMATCH = { kind: "mismatch" } as const;

function mismatch(
  mode: "fast" | "thorough",
  sourceSpan: Span,
  message: string,
  matchScore = 0,
): JsonTypeMatch {
  if (mode === "fast") {
    return FAST_MISMATCH;
  }
  return {
    kind: "mismatch",
    details: {
      reason: {
        span: { start: sourceSpan.start, end: sourceSpan.end },
        message,
      },
      matchScore,
    },
  };
}
