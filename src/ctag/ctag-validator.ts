import { jsonMatchesType, validateJson } from "../json/json-validator.js";
import type { Schema } from "../schema/schema-types.js";
import { resolveType } from "../schema/type-resolver.js";
import type { InternalError } from "../util/shared-types.js";
import type { CTag } from "./ctag-types.js";

export { validateJson };

export function validateCTag(
  cTag: CTag,
  schema: Schema,
): readonly InternalError[] {
  switch (cTag.kind) {
    case "identifier": {
      if (!schema.identifiers.has(cTag.identifier.text)) {
        return [
          {
            span: {
              start: cTag.identifier.start,
              end: cTag.identifier.end,
            },
            message: `Identifier '${cTag.identifier.text}' not found in schema`,
          },
        ];
      } else {
        return [];
      }
    }
    case "json": {
      if (
        Object.values(schema.typeDeclarations).some(
          (t) =>
            jsonMatchesType(cTag.json, resolveType(t, schema), "fast", schema)
              .kind === "match",
        )
      ) {
        return [];
      } else {
        const mismatches = Object.entries(schema.typeDeclarations).map(
          ([name, t]) => {
            const result = jsonMatchesType(
              cTag.json,
              resolveType(t, schema),
              "thorough",
              schema,
            );
            const score =
              result.kind === "mismatch"
                ? (result.details?.matchScore ?? 0)
                : 0;
            const reason =
              result.kind === "mismatch" ? result.details?.reason : undefined;
            return { name, score, reason };
          },
        );
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
              span: {
                start: cTag.json.firstToken.start,
                end: cTag.json.firstToken.end,
              },
              message: `Does not match type '${best.name}'`,
            },
            best.reason,
          ];
        } else {
          return [
            {
              span: {
                start: cTag.json.firstToken.start,
                end: cTag.json.firstToken.end,
              },
              message: `Does not match any of the types defined in the schema`,
            },
          ];
        }
      }
    }
  }
}
