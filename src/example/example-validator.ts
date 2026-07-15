import type { JsonValue } from "../json/json-types.js";
import type { ResolvedType, Schema } from "../schema/schema-types.js";
import { resolveType } from "../schema/type-resolver.js";
import type { InternalError, SourceSpan } from "../util/error-types.js";
import type { Example } from "./example-types.js";

export function validateExample(
  example: Example,
  schema: Schema,
): readonly InternalError[] {
  switch (example.kind) {
    case "success:identifier": {
      if (!schema.identifiers.has(example.identifier.text)) {
        return [
          {
            start: example.identifier.start,
            end: example.identifier.end,
            message: `Identifier '${example.identifier.text}' not found in schema`,
          },
        ];
      } else {
        return [];
      }
    }
    case "success:json": {
      if (
        Object.values(schema.types).some(
          (t) =>
            jsonMatchesType(
              example.json,
              resolveType(t, schema.types),
              "fast",
              schema,
            ).kind === "match",
        )
      ) {
        return [];
      } else {
        const mismatches = Object.entries(schema.types).map(([name, t]) => {
          const result = jsonMatchesType(
            example.json,
            resolveType(t, schema.types),
            "thorough",
            schema,
          );
          const score =
            result.kind === "mismatch" ? (result.details?.matchScore ?? 0) : 0;
          const reason =
            result.kind === "mismatch" ? result.details?.reason : undefined;
          return { name, score, reason };
        });
        const best = mismatches.reduce<
          | {
              name: string;
              score: number;
              reason: InternalError | undefined;
            }
          | undefined
        >(
          (acc, m) => (acc === undefined || m.score > acc.score ? m : acc),
          undefined,
        );
        if (
          best !== undefined &&
          best.score >= 0.5 &&
          best.reason !== undefined
        ) {
          return [
            {
              start: example.json.firstToken.start,
              end: example.json.firstToken.end,
              message: `Does not match type '${best.name}'`,
            },
            best.reason,
          ];
        } else {
          return [
            {
              start: example.json.firstToken.start,
              end: example.json.firstToken.end,
              message: `Does not match any of the types defined in the schema`,
            },
          ];
        }
      }
    }
  }
}

export function validateJson(
  json: JsonValue<"strict">,
  schema: Schema,
  typeName: string,
): InternalError[] {
  const t = schema.types[typeName]!;
  const result = jsonMatchesType(
    json as JsonValue<"loose">,
    resolveType(t, schema.types),
    "thorough",
    schema,
  );
  if (result.kind === "match") {
    return [];
  }
  const errors: InternalError[] = [
    {
      start: json.firstToken.start,
      end: json.firstToken.end,
      message: `Does not match type '${typeName}'`,
    },
  ];
  if (result.details !== undefined && result.details.matchScore >= 0.5) {
    errors.push(result.details.reason);
  }
  return errors;
}

type JsonTypeMatch =
  | { readonly kind: "match" }
  | {
      readonly kind: "mismatch";
      readonly details?: {
        readonly reason: InternalError;
        /** In [0, 1]. Used to infer which of two mismatches was closer to a match. */
        readonly matchScore: number;
      };
    };

function jsonMatchesType(
  value: JsonValue<"loose">,
  type: ResolvedType,
  mode: "fast" | "thorough",
  schema: Schema,
): JsonTypeMatch {
  if (value.kind === "ellipsis") {
    return MATCH;
  }
  switch (type.kind) {
    case "array": {
      if (value.kind === "array") {
        const elementType = resolveType(type.elementType, schema.types);
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
        if (/^-?\d+$/.test(value.firstToken.text)) {
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
    case "interface": {
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
            const fieldType = resolveType(field.type, schema.types);
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
                start: entry.key.firstToken.start,
                end: entry.key.firstToken.end,
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
                start: field.name.start,
                end: field.name.end,
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
    case "string-literal": {
      if (value.kind === "string") {
        if (value.value === type.value) {
          return MATCH;
        } else {
          // Not the right string.
          return mismatch(
            mode,
            value.firstToken,
            `Expected "${type.value}" but got ${value.firstToken.text}`,
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
            if (value.entries.length === 0 && value.ellipsis) {
              return MATCH;
            }
            const { kindFieldName } = members;
            const kindValue = value.entries.find(
              (e) => e.key.value === kindFieldName,
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
                `Missing required field '${kindFieldName}'`,
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
  sourceSpan: SourceSpan,
  message: string,
  matchScore = 0,
): JsonTypeMatch {
  if (mode === "fast") {
    return FAST_MISMATCH;
  }
  return {
    kind: "mismatch",
    details: {
      reason: { start: sourceSpan.start, end: sourceSpan.end, message },
      matchScore,
    },
  };
}
