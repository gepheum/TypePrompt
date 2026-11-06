import type {
  FieldType,
  Schema,
  SyntheticType,
  TypeNameView,
} from "./schema-types.js";
import { resolveType } from "./type-resolver.js";

/**
 * Recursively reorders object properties to match the field declaration order
 * in `schemaType`.
 */
export function normalizeSchemaValue(
  value: unknown,
  schemaType: {
    readonly type: FieldType | SyntheticType | TypeNameView;
    readonly schema: Schema;
  },
): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  const resolved = resolveType(schemaType.type, schemaType.schema);
  switch (resolved.kind) {
    case "any":
    case "primitive":
    case "string-literal":
    case "boolean-literal": {
      return value;
    }
    case "optional": {
      return normalizeSchemaValue(value, {
        type: resolved.innerType,
        schema: schemaType.schema,
      });
    }
    case "array": {
      if (!Array.isArray(value)) {
        return value;
      }
      return value.map((item) =>
        normalizeSchemaValue(item, {
          type: resolved.elementType,
          schema: schemaType.schema,
        }),
      );
    }
    case "record": {
      if (typeof value !== "object") {
        return value;
      }
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([k, v]) => [
          k,
          normalizeSchemaValue(v, {
            type: resolved.valueType,
            schema: schemaType.schema,
          }),
        ]),
      );
    }
    case "interface": {
      if (typeof value !== "object") {
        return value;
      }
      const obj = value as Record<string, unknown>;
      const result: Record<string, unknown> = {};
      for (const field of Object.values(resolved.fields)) {
        const fieldName = field.name.text;
        if (
          Object.prototype.hasOwnProperty.call(obj, fieldName) &&
          obj[fieldName] !== undefined
        ) {
          result[fieldName] = normalizeSchemaValue(obj[fieldName], {
            type: field.type,
            schema: schemaType.schema,
          });
        }
      }
      return result;
    }
    case "union": {
      const members = schemaType.schema.unionToMembers.get(resolved)!;
      if (members.kind === "strings") {
        return value;
      }
      if (typeof value !== "object") {
        return value;
      }
      const obj = value as Record<string, unknown>;
      const discriminant = obj[members.discriminator];
      if (discriminant === undefined || discriminant === null) {
        return value;
      }
      const member = members.members[String(discriminant)];
      if (!member) {
        return value;
      }
      return normalizeSchemaValue(value, {
        type: member.resolved,
        schema: schemaType.schema,
      });
    }
  }
}
