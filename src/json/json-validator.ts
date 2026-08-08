import type {
  HasName,
  ResolvedType,
  Schema,
  SyntheticType,
  TypeDeclaration,
} from "../schema/schema-types.js";
import { resolveSyntheticType } from "../schema/type-resolver.js";
import type { InternalError, Span } from "../util/shared-types.js";
import type {
  JsonTypeMatch,
  LooseJsonValue,
  StrictJsonValue,
} from "./json-types.js";

type SchemaView = {
  readonly typeDeclarations: Schema["typeDeclarations"];
  readonly sharedDeclarations: Schema["sharedDeclarations"];
  readonly unionToMembers: Schema["unionToMembers"];
};

export function validateJson(
  json: StrictJsonValue,
  type: TypeDeclaration | (SyntheticType & HasName),
  schema: SchemaView,
): InternalError[] {
  const result = jsonMatchesType(
    json as LooseJsonValue,
    resolveSyntheticType(type, schema),
    "thorough",
    schema,
  );
  if (result.kind === "match") {
    return [];
  }
  const typeName = type.name.text;
  const errors: InternalError[] = [
    {
      span: {
        start: json.firstToken.start,
        end: json.firstToken.end,
      },
      message: `Does not match type '${typeName}'`,
    },
  ];
  if (result.details !== undefined) {
    errors.push(result.details.reason);
  }
  return errors;
}

export function jsonMatchesType(
  value: LooseJsonValue,
  type: ResolvedType | SyntheticType,
  mode: "fast" | "thorough",
  schema: SchemaView,
): JsonTypeMatch {
  if (value.kind === "ellipsis") {
    return MATCH;
  }
  switch (type.kind) {
    case "any": {
      return MATCH;
    }
    case "array": {
      if (value.kind === "array") {
        const elementType = resolveSyntheticType(type.elementType, schema);
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
      if (value.kind === type.primitive.text) {
        return MATCH;
      } else if (value.kind === "number" && type.primitive.text === "integer") {
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
    case "interface": {
      if (value.kind === "object") {
        const requiredFields = Object.values(type.fields).filter(
          (field) => !field.optional,
        );
        if (
          Object.keys(value.entries).length === 0 &&
          (requiredFields.length === 0 || value.ellipsis)
        ) {
          // To avoid a division by zero later.
          return MATCH;
        }
        let matchScoreTotal = 0.0;
        let firstMismatchReason: InternalError | undefined;
        const seenFieldNames = new Set<string>();
        for (const entry of Object.values(value.entries)) {
          const fieldName = entry.key.value;
          seenFieldNames.add(fieldName);
          const field = type.fields[fieldName];
          if (field) {
            const fieldType = resolveSyntheticType(field.type, schema);
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
          const divisor =
            requiredFields.length + Object.keys(value.entries).length;
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
        const valueType = resolveSyntheticType(type.valueType, schema);
        let matchScoreTotal = 0.0;
        for (const entry of Object.values(value.entries)) {
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
                  matchScore:
                    matchScoreTotal / Object.keys(value.entries).length,
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
    case "union":
    case "synthetic-union": {
      const members =
        type.kind === "union" ? schema.unionToMembers.get(type)! : type.members;
      switch (members.kind) {
        case "strings": {
          if (value.kind === "string") {
            if (members.values.has(value.value)) {
              return MATCH;
            } else {
              const message = makeExpectedOneOfMessage([...members.values]);
              const suggestions = [...members.values].map((v) => `"${v}"`);
              return mismatch(
                mode,
                value.firstToken,
                message,
                0.5,
                suggestions,
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
            if (Object.keys(value.entries).length <= 0 && value.ellipsis) {
              return MATCH;
            }
            const { discriminator } = members;
            const kindValue = value.entries[discriminator];
            if (kindValue) {
              if (kindValue.value.kind === "string") {
                const member = members.members[kindValue.value.value];
                if (member) {
                  return jsonMatchesType(value, member, mode, schema);
                } else {
                  // No matching member for the kind value in the union.
                  const { discriminants } = members;
                  const message = makeExpectedOneOfMessage(
                    discriminants.map((d) => d.value),
                  );
                  const suggestions = Object.keys(members.members).map(
                    (v) => `"${v}"`,
                  );

                  return mismatch(
                    mode,
                    kindValue.value.firstToken,
                    message,
                    0.5,
                    suggestions,
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

function makeExpectedOneOfMessage(values: readonly string[]): string {
  return values.length <= 0
    ? "Expected: never"
    : values.length <= 1
      ? `Expected: '${values[0]}'`
      : "Expected: one of ".concat(values.map((v) => `"${v}"`).join(", "));
}

function mismatch(
  mode: "fast" | "thorough",
  sourceSpan: Span,
  message: string,
  matchScore = 0,
  suggestions?: readonly string[],
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
        suggestions,
      },
      matchScore,
    },
  };
}
