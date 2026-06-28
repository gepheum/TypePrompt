import type { TypeDeclaration, Union, UnionMembers } from "./schema-types.js";
import { resolveType } from "./type-resolver.js";

export function getUnionMembers(
  type: Union,
  types: { readonly [name: string]: TypeDeclaration },
): UnionMembers {
  const { members } = type;
  const firstMember = members[0]!;
  switch (firstMember.kind) {
    case "string-literal": {
      return {
        kind: "strings",
        members: members as (typeof firstMember)[],
      };
    }
    case "interface": {
      return {
        kind: "interfaces",
        members: members.map((m) => {
          if (m.kind !== "interface") {
            throw new Error();
          }
          const firstFieldType = resolveType(m.firstField!.type, types)!;
          if (firstFieldType.kind !== "string-literal") {
            throw new Error();
          }
          return {
            interface: m,
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
