import type {
  HasName,
  ResolvedFieldType,
  Schema,
  SyntheticType,
  TypeDeclaration,
} from "../schema/schema-types.js";
import { resolveType } from "../schema/type-resolver.js";
import type {
  DefinitionLink,
  InternalError,
  Span,
} from "../util/shared-types.js";
import type { LooseJsonValue, StrictJsonValue } from "./json-types.js";

type SchemaView = {
  readonly typeDeclarations: Schema["typeDeclarations"];
  readonly sharedDeclarations: Schema["sharedDeclarations"];
  readonly unionToMembers: Schema["unionToMembers"];
};

export type JsonTypeMatch<Mode extends "fast" | "thorough"> =
  | {
      readonly kind: "match";
      readonly definitionLinks: readonly DefinitionLink[];
    }
  | {
      readonly kind: "mismatch";
      readonly details: Mode extends "thorough"
        ? {
            /** Guaranteed to not be empty. */
            readonly reasons: readonly InternalError[];
            /** In [0, 1]. Used to infer which of two mismatches was closer to a match. */
            readonly matchScore: number;
          }
        : undefined;
    };

/**
 * Validates a parsed JSON AST against a schema type declaration or synthetic type.
 *
 * Runs {@link jsonMatchesType} in "thorough" mode to generate descriptive errors
 * when validation fails, including the root type mismatch error and any nested failure reason.
 *
 * @param json The strict JSON AST value to validate.
 * @param type The target type declaration or named synthetic type.
 * @param schema The schema view providing type and union resolution tables.
 * @returns An array of {@link InternalError} diagnostics (empty on successful validation).
 */
export function validateJson(
  json: StrictJsonValue,
  type: TypeDeclaration | (SyntheticType & HasName),
  schema: SchemaView,
): readonly InternalError[] {
  const result = jsonMatchesType(
    json as LooseJsonValue,
    resolveType(type.kind === "type" ? type.valueType : type, schema),
    "thorough",
    schema,
  );
  if (result.kind === "match") {
    return [];
  }
  const typeName = type.name.text;
  const errors = result.details.reasons ?? [
    {
      span: json.firstToken,
      message: `Does not match type '${typeName}'`,
    },
  ];
  return errors;
}

/**
 * Checks whether a JSON value matches a schema type, supporting both fast pruning
 * and thorough error diagnostic/scoring modes.
 *
 * - In `"fast"` mode: Short-circuits immediately on the first failure without computing
 *   error diagnostics or similarity scores (returns `{ kind: "mismatch" }`).
 * - In `"thorough"` mode: Computes the first mismatch {@link InternalError} `reason`
 *   and a normalized `matchScore` in `[0, 1]`.
 *
 * Scoring algorithm:
 * - **Primitives & Literals**: Exact match = `1.0`. Close scalar mismatches (wrong string/bool
 *   literal or float for int) = `0.5`. Kind mismatches = `0.0`.
 * - **Interfaces**: Score weights both value type-correctness (up to 1.0 per entry) and
 *   the presence of required fields (1.0 per seen required field), divided by
 *   `(requiredFields.length + entries.length)`.
 * - **Records & Arrays**: Average match score of elements/entries up to the first mismatch
 *   divided by the total element/entry count.
 * - **Discriminated Unions**: Matches discriminant to member type. Unknown discriminant
 *   value of expected kind = `0.5`, wrong kind = `0.0`. Valid member discriminant delegates
 *   to member's interface scoring.
 * - **Wildcards**: `ellipsis` and `any` types always return a full match.
 */
export function jsonMatchesType<const Mode extends "fast" | "thorough">(
  value: LooseJsonValue,
  type: ResolvedFieldType | SyntheticType,
  mode: Mode,
  schema: SchemaView,
): JsonTypeMatch<Mode> {
  if (value.kind === "ellipsis") {
    return MATCH;
  }
  switch (type.kind) {
    case "any": {
      return MATCH;
    }
    case "array": {
      if (value.kind === "array") {
        const elementType = resolveType(type.elementType, schema);
        let matchScoreTotal = 0.0;
        const definitionLinks: DefinitionLink[] = [];
        const mismatchReasons: InternalError[] = [];
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
            definitionLinks.push(...elementMatch.definitionLinks);
          } else if (elementMatch.kind === "mismatch") {
            if (mode === "fast") {
              return FAST_MISMATCH as JsonTypeMatch<Mode>;
            } else {
              const details = elementMatch.details!;
              matchScoreTotal += details.matchScore;
              mismatchReasons.push(...details.reasons);
            }
          }
        }
        if (mismatchReasons.length) {
          return {
            kind: "mismatch",
            details: {
              reasons: mismatchReasons,
              matchScore: matchScoreTotal / elements.length,
            },
          } satisfies JsonTypeMatch<"thorough"> as unknown as JsonTypeMatch<Mode>;
        }
        return {
          kind: "match",
          definitionLinks,
        };
      } else {
        return mismatch(
          mode,
          value.firstToken,
          `Expected array but got ${value.kind}`,
        );
      }
    }
    case "boolean-literal": {
      if (value.kind === "boolean" && value.value === type.value) {
        return MATCH;
      } else {
        const suggestions = [type.span.text];
        return mismatch(
          mode,
          value.firstToken,
          makeExpectedOneOfMessage([type.value]),
          value.kind === "boolean" ? 0.5 : 0,
          suggestions,
        );
      }
    }
    case "interface": {
      if (value.kind === "object") {
        const requiredFields = Object.values(type.fields).filter(
          (field) => field.type.kind !== "optional",
        );
        if (
          Object.keys(value.entries).length <= 0 &&
          (requiredFields.length <= 0 || value.ellipsis)
        ) {
          // To avoid a division by zero later.
          return MATCH;
        }
        let matchScoreTotal = 0.0;
        const definitionLinks: DefinitionLink[] = [];
        const mismatchReasons: InternalError[] = [];
        const seenFieldNames = new Set<string>();
        // Includes both required and optional schema fields.
        const missingFields: readonly string[] = Object.keys(
          type.fields,
        ).filter((name) => !value.entries[name]);
        for (const entry of Object.values(value.entries)) {
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
              definitionLinks.push(...fieldMatch.definitionLinks);
            } else {
              const _: "mismatch" = fieldMatch.kind;
              if (mode === "fast") {
                return FAST_MISMATCH as JsonTypeMatch<Mode>;
              } else {
                matchScoreTotal += fieldMatch.details!.matchScore;
                mismatchReasons.push(...fieldMatch.details!.reasons);
              }
            }
          } else {
            // Field present in the object but not defined in the interface.
            if (mode === "fast") {
              return FAST_MISMATCH as JsonTypeMatch<Mode>;
            } else {
              mismatchReasons.push({
                span: entry.key.firstToken,
                message: `Unknown field '${fieldName}'`,
                suggestions: missingFields,
              });
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
            } else if (mode === "fast") {
              return FAST_MISMATCH as JsonTypeMatch<Mode>;
            } else {
              mismatchReasons.push({
                span: value.firstToken,
                message: `Missing required field '${fieldName}'`,
              });
            }
          }
        }
        if (mismatchReasons.length !== 0) {
          const divisor =
            requiredFields.length + Object.keys(value.entries).length;
          return {
            kind: "mismatch",
            details: {
              reasons: mismatchReasons,
              matchScore: matchScoreTotal / divisor,
            },
          } satisfies JsonTypeMatch<"thorough"> as unknown as JsonTypeMatch<Mode>;
        } else {
          return {
            kind: "match",
            definitionLinks,
          };
        }
      } else {
        return mismatch(
          mode,
          value.firstToken,
          `Expected object but got ${value.kind}`,
        );
      }
    }
    case "optional": {
      if (value.kind === "null") {
        return MATCH;
      } else {
        const innerType = resolveType(type.innerType, schema);
        return jsonMatchesType(value, innerType, mode, schema);
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
            "Expected int but got float",
            0.5,
          );
        }
      } else {
        return mismatch(
          mode,
          value.firstToken,
          `Expected ${type.primitive.text} but got ${value.kind}`,
        );
      }
    }
    case "record": {
      if (value.kind === "object") {
        const valueType = resolveType(type.valueType, schema);
        let matchScoreTotal = 0.0;
        const definitionLinks: DefinitionLink[] = [];
        const mismatchReasons: InternalError[] = [];
        for (const entry of Object.values(value.entries)) {
          const valueMatch = jsonMatchesType(
            entry.value,
            valueType,
            mode,
            schema,
          );
          if (valueMatch.kind === "match") {
            matchScoreTotal += 1.0;
            definitionLinks.push(...valueMatch.definitionLinks);
          } else if (valueMatch.kind === "mismatch") {
            if (mode === "fast") {
              return FAST_MISMATCH as JsonTypeMatch<Mode>;
            } else {
              const details = valueMatch.details!;
              matchScoreTotal += details.matchScore;
              mismatchReasons.push(...details.reasons);
            }
          }
        }
        if (mismatchReasons.length !== 0) {
          const dividor = Object.keys(value.entries).length;
          return {
            kind: "mismatch",
            details: {
              reasons: mismatchReasons,
              matchScore: matchScoreTotal / dividor,
            },
          } satisfies JsonTypeMatch<"thorough"> as unknown as JsonTypeMatch<Mode>;
        }
        return {
          kind: "match",
          definitionLinks,
        };
      } else {
        return mismatch(
          mode,
          value.firstToken,
          `Expected object but got ${value.kind}`,
        );
      }
    }
    case "string-literal": {
      if (value.kind === "string" && value.value === type.value) {
        return MATCH;
      } else {
        const suggestions = [JSON.stringify(type.value satisfies string)];
        return mismatch(
          mode,
          value.firstToken,
          makeExpectedOneOfMessage([type.value]),
          value.kind === "string" ? 0.5 : 0,
          suggestions,
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
            const discriminantEntry = value.entries[discriminator];
            if (discriminantEntry) {
              const discriminant: LooseJsonValue = discriminantEntry.value;
              if (discriminant.kind === members.discriminants.type) {
                const member = members.members[String(discriminant.value)];
                if (member) {
                  return jsonMatchesType(value, member.resolved, mode, schema);
                } else {
                  // No matching member for the discriminant in the union.
                  const discriminants = members.discriminants.values;
                  const message = makeExpectedOneOfMessage(
                    discriminants.map((d) =>
                      String(d.value satisfies string | boolean),
                    ),
                  );
                  const suggestions = discriminants.map((d) =>
                    JSON.stringify(d.value satisfies string | boolean),
                  );

                  return mismatch(
                    mode,
                    discriminant.firstToken,
                    message,
                    0.5,
                    suggestions,
                  );
                }
              } else {
                // Discriminant value is not a string/boolean.
                const { discriminants } = members;
                const expected: "string" | "boolean" = discriminants.type;
                const got = discriminant.kind;
                const suggestions = discriminants.values.map((d) =>
                  JSON.stringify(d.value satisfies string | boolean),
                );
                return mismatch(
                  mode,
                  discriminant.firstToken,
                  `Expected ${expected} but got ${got}`,
                  0,
                  suggestions,
                );
              }
            } else {
              // Discriminator not found in JSON object.
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

export function collectDefinitionLinks(
  value: LooseJsonValue,
  type: ResolvedFieldType | SyntheticType,
  schema: SchemaView,
): readonly DefinitionLink[] {
  if (value.kind === "ellipsis") {
    return [];
  }
  switch (type.kind) {
    case "any":
    case "boolean-literal":
    case "primitive":
    case "string-literal": {
      return [];
    }
    case "array": {
      if (value.kind !== "array") {
        return [];
      }
      const definitionLinks: DefinitionLink[] = [];
      const elementType = resolveType(type.elementType, schema);
      const { elements } = value;
      for (const element of elements) {
        definitionLinks.push(
          ...collectDefinitionLinks(element, elementType, schema),
        );
      }
      return definitionLinks;
    }
    case "interface": {
      if (value.kind !== "object") {
        return [];
      }
      const definitionLinks: DefinitionLink[] = [];
      for (const entry of Object.values(value.entries)) {
        const fieldName = entry.key;
        const schemaField = type.fields[fieldName.value];
        if (!schemaField) {
          continue;
        }
        if (schemaField.name.start !== undefined) {
          definitionLinks.push({
            reference: fieldName.firstToken,
            definition: schemaField.name,
          });
        }
        const fieldType = resolveType(schemaField.type, schema);
        definitionLinks.push(
          ...collectDefinitionLinks(entry.value, fieldType, schema),
        );
      }
      return definitionLinks;
    }
    case "optional": {
      if (value.kind === "null") {
        return [];
      } else {
        const innerType = resolveType(type.innerType, schema);
        return collectDefinitionLinks(value, innerType, schema);
      }
    }
    case "record": {
      if (value.kind !== "object") {
        return [];
      }
      const valueType = resolveType(type.valueType, schema);
      const definitionLinks: DefinitionLink[] = [];
      for (const entry of Object.values(value.entries)) {
        definitionLinks.push(
          ...collectDefinitionLinks(entry.value, valueType, schema),
        );
      }
      return definitionLinks;
    }
    case "union":
    case "synthetic-union": {
      const members =
        type.kind === "union" ? schema.unionToMembers.get(type)! : type.members;
      switch (members.kind) {
        case "strings": {
          return [];
        }
        case "interfaces": {
          if (value.kind !== "object") {
            return [];
          }
          const { discriminator } = members;
          const discriminantEntry = value.entries[discriminator];
          if (discriminantEntry) {
            const discriminant: LooseJsonValue | StrictJsonValue =
              discriminantEntry.value;
            if (discriminant.kind === members.discriminants.type) {
              const member = members.members[String(discriminant.value)];
              if (member) {
                return collectDefinitionLinks(value, member.resolved, schema);
              }
            }
          }
          return [];
        }
      }
    }
  }
}

const MATCH = { kind: "match", definitionLinks: [] } as const;
const FAST_MISMATCH: JsonTypeMatch<"fast"> = {
  kind: "mismatch",
  details: undefined,
};

function makeExpectedOneOfMessage(
  values: ReadonlyArray<string | boolean>,
): string {
  return values.length <= 0
    ? "Expected: never"
    : values.length <= 1
      ? "Expected ".concat(JSON.stringify(values[0]!))
      : "Expected one of ".concat(JSON.stringify(values));
}

function mismatch<Mode extends "fast" | "thorough">(
  mode: Mode,
  sourceSpan: Span,
  message: string,
  matchScore = 0,
  suggestions?: readonly string[],
): JsonTypeMatch<Mode> {
  if (mode === "fast") {
    return FAST_MISMATCH as JsonTypeMatch<Mode>;
  }
  const reasons: readonly InternalError[] = [
    {
      span: sourceSpan,
      message,
      suggestions,
    },
  ];
  return {
    kind: "mismatch",
    details: { reasons, matchScore },
  } satisfies JsonTypeMatch<"thorough"> as unknown as JsonTypeMatch<Mode>;
}
