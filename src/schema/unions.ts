import type { TypeDeclaration, Union, UnionMembers } from "./schema-types.js";
import { resolveType } from "./type-resolver.js";

export function getUnionMembers(
  type: Union,
  types: { readonly [name: string]: TypeDeclaration },
): UnionMembers {
  const { members } = type;
  const firstMember = resolveType(members[0]!, types)!;
  switch (firstMember.kind) {
    case "string-literal": {
      return {
        kind: "strings",
        members: members.map((m) => {
          const resolved = resolveType(m, types)!;
          if (resolved.kind !== "string-literal") {
            throw new Error();
          }
          return resolved;
        }),
      };
    }
    case "interface": {
      return {
        kind: "interfaces",
        members: members.map((m) => {
          const resolved = resolveType(m, types)!;
          if (resolved.kind !== "interface") {
            throw new Error();
          }
          const firstFieldType = resolveType(resolved.firstField!.type, types)!;
          if (firstFieldType.kind !== "string-literal") {
            throw new Error();
          }
          return {
            interface: resolved,
            kind: firstFieldType.value,
          };
        }),
        fieldName: firstMember.firstField!.name.text,
      };
    }
    default: {
      throw new Error();
    }
  }
}
