import type {
  FieldType,
  ResolvedFieldType,
  Schema,
  SyntheticType,
  TypeNameView,
} from "./schema-types.js";
import { resolveType } from "./type-resolver.js";

/**
 * Recursively reorders object properties to match the field declaration order
 * in `schemaType`.
 *
 * In 'user' mode, fields annotated with `@omitDefault` are omitted if they
 * hold the default value for their type: null for optional, [] for array,
 * 0/false/"" for primitive.
 * In 'assistant' mode, every field is output.
 */
export function normalizeSchemaValue(
  value: unknown,
  schemaType: {
    readonly type: FieldType | SyntheticType | TypeNameView;
    readonly schema: Schema;
  },
  mode: "user" | "assistant",
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
      return normalizeSchemaValue(
        value,
        {
          type: resolved.innerType,
          schema: schemaType.schema,
        },
        mode,
      );
    }
    case "array": {
      if (!Array.isArray(value)) {
        return value;
      }
      return value.map((item) =>
        normalizeSchemaValue(
          item,
          {
            type: resolved.elementType,
            schema: schemaType.schema,
          },
          mode,
        ),
      );
    }
    case "record": {
      if (typeof value !== "object") {
        return value;
      }
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([k, v]) => [
          k,
          normalizeSchemaValue(
            v,
            {
              type: resolved.valueType,
              schema: schemaType.schema,
            },
            mode,
          ),
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
        const normalizedValue = normalizeSchemaValue(
          obj[fieldName] ?? null,
          {
            type: field.type,
            schema: schemaType.schema,
          },
          mode,
        );

        if (mode === "user" && field.omitDefault !== null) {
          const fieldType = resolveType(field.type, schemaType.schema);
          const isDefaultValue = isDefaultValueForFieldType(
            normalizedValue,
            fieldType,
          );
          if (isDefaultValue) continue;
        }
        result[fieldName] = normalizedValue;
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
      return normalizeSchemaValue(
        value,
        {
          type: member.resolved,
          schema: schemaType.schema,
        },
        mode,
      );
    }
  }
}

function isDefaultValueForFieldType(
  value: unknown,
  resolvedType: ResolvedFieldType,
): boolean {
  switch (resolvedType.kind) {
    case "optional":
      return value === null;
    case "array":
      return Array.isArray(value) && value.length <= 0;
    case "primitive": {
      switch (resolvedType.primitive.text) {
        case "boolean":
          return value === false;
        case "integer":
        case "number":
          return value === 0;
        case "string":
          return value === "";
        default:
          return false;
      }
    }
    default:
      return false;
  }
}
