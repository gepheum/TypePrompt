import type { SchemaView, Union, UnionMembers } from "./schema-types.js";
import { resolveMaybeInvalidType } from "./type-resolver.js";

export function getUnionMembers(type: Union, schema: SchemaView): UnionMembers {
  const { members } = type;
  const firstMember = resolveMaybeInvalidType(members[0]!, schema)!;
  switch (firstMember.kind) {
    case "string-literal": {
      const resolvedMembers = members.map((m) => {
        const resolved = resolveMaybeInvalidType(m, schema)!;
        if (resolved.kind !== "string-literal") {
          throw new Error();
        }
        return resolved;
      });
      return {
        kind: "strings",
        members: resolvedMembers,
        values: new Set(resolvedMembers.map((m) => m.value)),
      };
    }
    case "interface": {
      return {
        kind: "interfaces",
        kindFieldName: firstMember.firstField!.name.text,
        members: Object.fromEntries(
          members.map((m) => {
            const resolved = resolveMaybeInvalidType(m, schema)!;
            if (resolved.kind !== "interface") {
              throw new Error();
            }
            const firstFieldType = resolveMaybeInvalidType(
              resolved.firstField!.type,
              schema,
            )!;
            if (firstFieldType.kind !== "string-literal") {
              throw new Error();
            }
            const kind = firstFieldType.value;
            return [kind, resolved];
          }),
        ),
      };
    }
    default: {
      throw new Error();
    }
  }
}
