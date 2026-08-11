import { ResolvedType, Schema, SchemaField, Type } from "../schema/schema-types.js";
import { resolveType } from "../schema/type-resolver.js";
import { NullableType } from "./expression-types.js";

export function resolveFieldType(field: SchemaField, schema: Schema): ResolvedType | NullableType {
  if (field.optional) {
    return {
      kind: "nullable",
      type: resolveType(field.type, schema),
    }
  } else {
    return resolveType(field.type, schema);
  }
}
