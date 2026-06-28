import type { ResolvedType as ResolvedType, Schema, Type, TypeDeclaration } from "../schema/schema-types.js";
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
        return [{
          sourceSpan: example.identifier,
          message: `Identifier '${example.identifier.text}' is not defined in the schema`,
        }];
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
      return [];  // TODO
      break;
    }
  }
}

type JsonTypeMatch =
  | {
    readonly kind: "match";
    readonly type: Type;
  }
  | {
    readonly kind: "mismatch";
    readonly type: Type;
    readonly reason: {
      readonly message: ExampleValidationError;
    };
    /** Used to infer which of two mismatches was closer to a match. */
    readonly matchScore: number;
  };

function jsonMatchesType(
  value: JsonValue,
  type: ResolvedType,
  schema: Schema,
): boolean {
  switch (type.kind) {
    case "array": {
      return value.kind === "array" && value.values.every((v) =>
        jsonMatchesType(v, resolveType(type.elementType, schema.types)!, schema));
    }
    case "interface": {
    }
  }
  return true;
}
