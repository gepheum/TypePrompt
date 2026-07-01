import type { ResolvedType, Schema } from "../schema/schema-types.js";
import { resolveType } from "../schema/type-resolver.js";
import type {
  Example,
  ExampleValidationError,
  JsonValue,
} from "./example-types.js";

export function validateExample(
  example: Example,
  schema: Schema,
): readonly ExampleValidationError[] {
  switch (example.kind) {
    case "success:identifier": {
      if (!schema.identifiers.has(example.identifier.text)) {
        return [
          {
            sourceSpan: example.identifier,
            message: `Identifier '${example.identifier.text}' not found in schema`,
          },
        ];
      } else {
        return [];
      }
    }
    case "success:json": {
      // for (const [typeName, typeDeclaration] of Object.entries(schema.types)) {
      //   if (matchesTypeNameRef(typeName, example.json, schema.types, new Map())) {
      //     return [];
      //   }
      // }
      return []; // TODO
    }
  }
}

type JsonTypeMatch =
  | { readonly kind: "match" }
  | {
      readonly kind: "mismatch";
      readonly details?: {
        readonly reason: ExampleValidationError;
        /** Used to infer which of two mismatches was closer to a match. */
        readonly matchScore: number;
      };
    };

function jsonMatchesType(
  value: JsonValue,
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
        if (mode === "fast") {
          return FAST_MISMATCH;
        } else {
          return {
            kind: "mismatch",
            details: {
              reason: {
                sourceSpan: value.firstToken,
                message: `Expected array but got ${value.kind}`,
              },
              matchScore: 0,
            },
          };
        }
      }
    }
    case "primitive": {
      if (value.kind === type.primitive) {
        return MATCH;
      } else if (value.kind === "number" && type.primitive === "int") {
        if (/^-?\d+$/.test(value.firstToken.text)) {
          return MATCH;
        } else {
          if (mode === "fast") {
            return FAST_MISMATCH;
          } else {
            return {
              kind: "mismatch",
              details: {
                reason: {
                  sourceSpan: value.firstToken,
                  message: `Expected int but got float`,
                },
                matchScore: 0.5,
              },
            };
          }
        }
      } else {
        if (mode === "fast") {
          return FAST_MISMATCH;
        } else {
          return {
            kind: "mismatch",
            details: {
              reason: {
                sourceSpan: value.firstToken,
                message: `Expected ${type.primitive} but got ${value.kind}`,
              },
              matchScore: 0,
            },
          };
        }
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
        let firstMismatchReason: ExampleValidationError | undefined;
        const seenFieldNames = new Set<string>();
        for (const entry of value.entries) {
          const fieldName = entry.key.firstToken.text;
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
                sourceSpan: entry.key.firstToken,
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
                sourceSpan: field.name,
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
        if (mode === "fast") {
          return FAST_MISMATCH;
        } else {
          return {
            kind: "mismatch",
            details: {
              reason: {
                sourceSpan: value.firstToken,
                message: `Expected object but got ${value.kind}`,
              },
              matchScore: 0,
            },
          };
        }
      }
    }
    case "string-literal": {
      if (value.kind === "string") {
        if (value.value === type.value) {
          return MATCH;
        } else {
          // Not the right string.
          if (mode === "fast") {
            return FAST_MISMATCH;
          } else {
            return {
              kind: "mismatch",
              details: {
                reason: {
                  sourceSpan: value.firstToken,
                  message: `Expected "${type.value}" but got ${value.firstToken.text}`,
                },
                matchScore: 0,
              },
            };
          }
        }
      } else {
        // Not a string.
        if (mode === "fast") {
          return FAST_MISMATCH;
        } else {
          return {
            kind: "mismatch",
            details: {
              reason: {
                sourceSpan: value.firstToken,
                message: `Expected string but got ${value.kind}`,
              },
              matchScore: 0,
            },
          };
        }
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
              if (mode === "fast") {
                return FAST_MISMATCH;
              } else {
                return {
                  kind: "mismatch",
                  details: {
                    reason: {
                      sourceSpan: value.firstToken,
                      message: "Not found in union type",
                    },
                    matchScore: 0.5,
                  },
                };
              }
            }
          } else {
            // Not a string.
            if (mode === "fast") {
              return FAST_MISMATCH;
            } else {
              return {
                kind: "mismatch",
                details: {
                  reason: {
                    sourceSpan: value.firstToken,
                    message: `Expected string but got ${value.kind}`,
                  },
                  matchScore: 0,
                },
              };
            }
          }
        }
        case "interfaces": {
          if (value.kind === "object") {
            if (value.entries.length === 0 && value.ellipsis) {
              return MATCH;
            }
            const { kindFieldName } = members;
            const kindValue = value.entries.find(
              (e) => e.key.firstToken.text === kindFieldName,
            );
            if (kindValue) {
              if (kindValue.value.kind === "string") {
                const member = members.members[kindValue.value.value];
                if (member) {
                  return jsonMatchesType(value, member, mode, schema);
                } else {
                  // No matching member for the kind value in the union.
                  if (mode === "fast") {
                    return FAST_MISMATCH;
                  } else {
                    return {
                      kind: "mismatch",
                      details: {
                        reason: {
                          sourceSpan: kindValue.value.firstToken,
                          message: `No matching member for value "${kindValue.value.value}"`,
                        },
                        matchScore: 0.5,
                      },
                    };
                  }
                }
              } else {
                // Kind value is not a string.
                if (mode === "fast") {
                  return FAST_MISMATCH;
                } else {
                  return {
                    kind: "mismatch",
                    details: {
                      reason: {
                        sourceSpan: kindValue.value.firstToken,
                        message:
                          "Expected string but got " + kindValue.value.kind,
                      },
                      matchScore: 0,
                    },
                  };
                }
              }
            } else {
              // Kind field not found.
              if (mode === "fast") {
                return FAST_MISMATCH;
              } else {
                return {
                  kind: "mismatch",
                  details: {
                    reason: {
                      sourceSpan: value.firstToken,
                      message: `Missing required field '${kindFieldName}'`,
                    },
                    matchScore: 0,
                  },
                };
              }
            }
          } else {
            // Not an object.
            if (mode === "fast") {
              return FAST_MISMATCH;
            } else {
              return {
                kind: "mismatch",
                details: {
                  reason: {
                    sourceSpan: value.firstToken,
                    message: `Expected object but got ${value.kind}`,
                  },
                  matchScore: 0,
                },
              };
            }
          }
        }
      }
    }
  }
}

const MATCH = { kind: "match" } as const;
const FAST_MISMATCH = { kind: "mismatch" } as const;
