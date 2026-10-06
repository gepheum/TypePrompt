import { jsonMatchesType, validateJson } from "../json/json-validator.js";
import type { Schema } from "../schema/schema-types.js";
import { resolveType } from "../schema/type-resolver.js";
import type {
  InternalError,
  Span,
  TextSpan,
  ValidationResult,
} from "../util/shared-types.js";
import { ValidationResultBuilder } from "../util/validation-result-builder.js";
import type { CTag } from "./ctag-types.js";

export { validateJson };

export function validateCTag(
  cTag: CTag,
  schemas: readonly Schema[],
  toolNames: { readonly [name: string]: Span } = {},
): ValidationResult {
  switch (cTag.kind) {
    case "identifier":
      return validateIdentifierCTag(cTag, schemas, toolNames);
    case "json":
      return validateJsonCTag(cTag, schemas);
  }
}

function validateIdentifierCTag(
  cTag: Extract<CTag, { kind: "identifier" }>,
  schemas: readonly Schema[],
  toolNames: { readonly [name: string]: Span },
): ValidationResult {
  const validationResult = new ValidationResultBuilder();
  const { definitionLinks, errors } = validationResult;

  let found = false;
  for (const schema of schemas) {
    const def = schema.identifiers[cTag.identifier.text];
    if (def) {
      definitionLinks.push({
        reference: cTag.identifier,
        definition: def as TextSpan,
      });
      found = true;
      break;
    }
  }

  if (!found) {
    const toolDef = toolNames[cTag.identifier.text];
    if (toolDef) {
      definitionLinks.push({
        reference: cTag.identifier,
        definition: toolDef as TextSpan,
      });
      found = true;
    }
  }

  if (!found) {
    const suggestions = [
      ...new Set([
        ...schemas.flatMap((schema) => Object.keys(schema.identifiers)),
        ...Object.keys(toolNames),
      ]),
    ];
    errors.push({
      span: cTag.identifier,
      message: `Identifier '${cTag.identifier.text}' not found in schema`,
      suggestions,
    });
  }

  return validationResult;
}

function validateJsonCTag(
  cTag: Extract<CTag, { kind: "json" }>,
  schemas: readonly Schema[],
): ValidationResult {
  const validationResult = new ValidationResultBuilder();
  const { definitionLinks, errors } = validationResult;

  for (const schema of schemas) {
    for (const t of Object.values(schema.typeDeclarations)) {
      const match = jsonMatchesType(
        cTag.json,
        resolveType(t.valueType, schema),
        "fast",
        schema,
      );
      if (match.kind === "match") {
        definitionLinks.push(...match.definitionLinks);
        return validationResult;
      }
    }
  }

  const mismatches = schemas.flatMap((schema): readonly Mismatch[] =>
    Object.entries(schema.typeDeclarations).map(([name, t]): Mismatch => {
      const result = jsonMatchesType(
        cTag.json,
        resolveType(t.valueType, schema),
        "thorough",
        schema,
      );
      const score =
        result.kind === "mismatch" ? (result.details.matchScore ?? 0) : 0;
      const reason =
        result.kind === "mismatch" ? result.details.reasons[0] : undefined;
      return { name, score, reason };
    }),
  );
  const best = mismatches.reduce<Mismatch | undefined>(
    (acc, m): Mismatch | undefined =>
      acc === undefined || m.score > acc.score ? m : acc,
    undefined,
  );
  if (best !== undefined && best.score >= 0.5 && best.reason !== undefined) {
    errors.push(
      {
        span: cTag.json.firstToken,
        message: `Does not match type '${best.name}'`,
      },
      best.reason,
    );
  } else {
    errors.push({
      span: cTag.json.firstToken,
      message: "Does not match any of the types defined in the schema",
    });
  }

  return validationResult;
}

type Mismatch = {
  readonly name: string;
  readonly score: number;
  readonly reason: InternalError | undefined;
};
