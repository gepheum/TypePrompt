import { jsonMatchesType, validateJson } from "../json/json-validator.js";
import type { Schema } from "../schema/schema-types.js";
import { resolveType } from "../schema/type-resolver.js";
import type { InternalError } from "../util/shared-types.js";
import type { CTag } from "./ctag-types.js";

export { validateJson };

export function validateCTag(
  cTag: CTag,
  schemas: readonly Schema[],
  toolNames: ReadonlySet<string>,
): readonly InternalError[] {
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
  toolNames: ReadonlySet<string>,
): readonly InternalError[] {
  if (
    !schemas.some((schema) => cTag.identifier.text in schema.identifiers) &&
    !toolNames.has(cTag.identifier.text)
  ) {
    return [
      {
        span: cTag.identifier,
        message: `Identifier '${cTag.identifier.text}' not found in schema`,
      },
    ];
  } else {
    return [];
  }
}

function validateJsonCTag(
  cTag: Extract<CTag, { kind: "json" }>,
  schemas: readonly Schema[],
): readonly InternalError[] {
  if (
    schemas.some((schema) =>
      Object.values(schema.typeDeclarations).some(
        (t) =>
          jsonMatchesType(
            cTag.json,
            resolveType(t.valueType, schema),
            "fast",
            schema,
          ).kind === "match",
      ),
    )
  ) {
    return [];
  } else {
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
      return [
        {
          span: cTag.json.firstToken,
          message: `Does not match type '${best.name}'`,
        },
        best.reason,
      ];
    } else {
      return [
        {
          span: cTag.json.firstToken,
          message: "Does not match any of the types defined in the schema",
        },
      ];
    }
  }
}

type Mismatch = {
  readonly name: string;
  readonly score: number;
  readonly reason: InternalError | undefined;
};
