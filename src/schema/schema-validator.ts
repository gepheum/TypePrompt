import { checkNoAmbiguity } from "../util/casing.js";
import type {
  InternalError,
  InternalErrors,
  Span,
  TextSpan,
} from "../util/common-types.js";
import type {
  Interface,
  NamingHint,
  Schema,
  SchemaField,
  SchemaValidationContext,
  StringLiteral,
  Type,
  TypeDeclaration,
  Union,
  UnionMembers,
} from "./schema-types.js";
import { isPrimitiveType, resolveMaybeInvalidType } from "./type-resolver.js";
import { getUnionMembers } from "./unions.js";

export function validateSchema(
  typeDeclarations: { readonly [name: string]: TypeDeclaration },
  context: SchemaValidationContext,
): Schema | InternalErrors {
  const errors: InternalError[] = [];

  for (const typeDeclaration of Object.values(typeDeclarations)) {
    const { name } = typeDeclaration;
    validateType(typeDeclaration, typeDeclarations, errors);
    const nameDependencies = new Set<string>();
    collectNameDependencies(
      typeDeclaration.valueType,
      typeDeclarations,
      nameDependencies,
    );
    if (nameDependencies.has(name.text)) {
      errors.push({
        span: name,
        message: `Type '${name.text}' circularly references itself`,
      });
    }
  }

  const requiredTypeNames = ((): readonly string[] => {
    switch (context.kind) {
      case "meta":
        return ["Meta"];
      case "namespace":
        return [];
      case "template":
        return ["Input", "Output"];
    }
  })();
  for (const requiredTypeName of requiredTypeNames) {
    const requiredType = typeDeclarations[requiredTypeName];
    if (!requiredType) {
      errors.push({
        span: {
          start: 0,
          end: 0,
        },
        message: `Missing required type '${requiredTypeName}'`,
      });
    }
  }

  // Verify that all types are used.
  if (errors.length <= 0 && context.kind !== "namespace") {
    errors.push(...verifyAllTypesUsed(requiredTypeNames, typeDeclarations));
  }

  if (errors.length > 0) {
    return {
      kind: "error",
      errors: errors,
    };
  }

  const typeTraverser = TypeTraverser.traverseAll(typeDeclarations);

  return {
    kind: "success",
    typeDeclarations: typeDeclarations,
    identifiers: typeTraverser.identifiers,
    unionToMembers: typeTraverser.unionToMembers,
    typeToNamingHint: typeTraverser.typeToNamingHint,
  };
}

type UnionKind =
  | "good:strings"
  | "good:interfaces"
  | "bad:array"
  | "bad:primitive"
  | "bad:union"
  | "error";

function getUnionKind(
  member: Type,
  types: { readonly [name: string]: TypeDeclaration },
): UnionKind {
  const resolvedType = resolveMaybeInvalidType(member, types);
  if (!resolvedType) {
    return "error";
  }
  switch (resolvedType.kind) {
    case "array": {
      return "bad:array";
    }
    case "interface": {
      return "good:interfaces";
    }
    case "primitive": {
      return "bad:primitive";
    }
    case "string-literal": {
      return "good:strings";
    }
    case "union": {
      return "bad:union";
    }
  }
}

function getFirstToken(type: Type): Span {
  switch (type.kind) {
    case "array":
      return getFirstToken(type.elementType);
    case "interface":
      return type.leftCurlyBracket;
    case "string-literal":
      return type.quotedName;
    case "type-name":
      return type.name;
    case "union":
      return getFirstToken(type.members[0]!);
  }
}

function validateType(
  type: Type | TypeDeclaration,
  types: { readonly [name: string]: TypeDeclaration },
  errors: InternalError[],
): null {
  switch (type.kind) {
    case "array": {
      return validateType(type.elementType, types, errors);
    }
    case "interface": {
      errors.push(
        ...checkNoAmbiguity(
          Object.values(type.fields).map((f) => f.name),
          { exactMatchIsConflict: true },
        ),
      );
      for (const field of Object.values(type.fields)) {
        if (!/^[a-z][A-Za-z0-9]*$/.test(field.name.text)) {
          errors.push({
            span: field.name,
            message: WORD_MUST_START_WITH_LOWERCASE,
          });
        }
        validateType(field.type, types, errors);
      }
      return null;
    }
    case "string-literal": {
      if (!/^[a-z][A-Za-z0-9]*$/.test(type.value)) {
        errors.push({
          span: {
            start: type.quotedName.start + 1,
            end: type.quotedName.end - 1,
          },
          message: WORD_MUST_START_WITH_LOWERCASE,
        });
      }
      return null;
    }
    case "type": {
      validateTypeName(type.name, errors);
      return validateType(type.valueType, types, errors);
    }
    case "type-name": {
      const typeName = type.name.text;
      const isPrimitive = !!isPrimitiveType(typeName);
      if (!isPrimitive && !types[typeName]) {
        errors.push({
          span: type.name,
          message: `Unknown type '${typeName}'`,
        });
      }
      return null;
    }
    case "union": {
      validateUnionType(type, types, errors);
      return null;
    }
  }
}

function validateUnionType(
  type: Union,
  types: { readonly [name: string]: TypeDeclaration },
  errors: InternalError[] = [],
): void {
  const pushErrorForBadKind = (
    kind: "bad:array" | "bad:primitive" | "bad:union",
    type: Type,
  ): void => {
    const found = getDescForKind(kind);
    const firstToken = getFirstToken(type);
    errors.push({
      span: firstToken,
      message: `Union members must be either all strings or all interfaces; found: ${found}`,
    });
  };

  const { members } = type;
  for (const member of members) {
    validateType(member, types, errors);
  }
  // Make sure 'members' are either all string literals or all interfaces.
  const first = members[0]!;
  const unionKind = getUnionKind(first, types);
  switch (unionKind) {
    case "good:strings":
    case "good:interfaces": {
      break;
    }
    case "bad:array":
    case "bad:primitive":
    case "bad:union": {
      pushErrorForBadKind(unionKind, first);
      return;
    }
    case "error": {
      return;
    }
  }

  let allGood = true;
  for (const member of members.slice(1)) {
    const memberKind = getUnionKind(member, types);
    switch (memberKind) {
      case "good:strings":
      case "good:interfaces": {
        if (memberKind !== unionKind) {
          const firstToken = getFirstToken(type);
          const expected = getDescForKind(unionKind);
          const found = getDescForKind(memberKind);
          errors.push({
            span: firstToken,
            message: [
              "Union members must be either all strings or all interfaces; ",
              ` expected: ${expected}, found: ${found}`,
            ].join(""),
          });
          allGood = false;
        }
        break;
      }
      case "bad:array":
      case "bad:primitive":
      case "bad:union": {
        pushErrorForBadKind(memberKind, first);
        allGood = false;
        break;
      }
      case "error": {
        break;
      }
    }
  }
  if (!allGood) {
    return;
  }

  // At this stage: members are either all string literals or all interfaces.
  if (unionKind === "good:strings") {
    errors.push(
      ...checkNoAmbiguity(
        members.map((m) => {
          const resolved = resolveMaybeInvalidType(m, types);
          if (resolved?.kind !== "string-literal") {
            // Cannot happen: getUnionKind already verified this.
            throw new Error();
          }
          return {
            text: resolved.value,
            start: resolved.quotedName.start + 1,
            end: resolved.quotedName.end - 1,
          };
        }),
        { exactMatchIsConflict: true },
      ),
    );
  } else {
    const _: "good:interfaces" = unionKind;
    // Verify that all these conditions are satisfied:
    //   - the first field of each interface has string literal type
    //   - all string literals are distinct
    //   - all first fields have the same name
    const quotedNames: TextSpan[] = [];
    let discriminator: SchemaField | undefined;
    let allGood = true;
    for (const member of members) {
      const resolvedType = resolveMaybeInvalidType(member, types)!;
      if (resolvedType.kind !== "interface") {
        // Cannot happen.
        throw new Error();
      }
      const checkedFirstField = ((): {
        firstField: SchemaField;
        discriminatorType: StringLiteral;
      } | null => {
        const { firstField } = resolvedType;
        if (!firstField) {
          return null;
        }
        const discriminatorType = resolveMaybeInvalidType(
          firstField.type,
          types,
        );
        if (discriminatorType?.kind !== "string-literal") {
          return null;
        }
        return {
          firstField,
          discriminatorType,
        };
      })();
      if (!checkedFirstField) {
        const firstToken =
          resolvedType.firstField?.name ?? getFirstToken(resolvedType);
        errors.push({
          span: firstToken,
          message:
            "The first field of an interface in a union must be a string literal",
        });
        allGood = false;
        continue;
      }
      const { firstField, discriminatorType } = checkedFirstField;
      if (!discriminator) {
        discriminator = firstField;
      } else if (discriminator.name.text !== firstField.name.text) {
        errors.push({
          span: firstField.name,
          message: [
            "The first field of an interface in a union must have the same name as ",
            "the other members; ",
            `expected: ${discriminator.name.text}, found: ${firstField.name.text}`,
          ].join(""),
        });
        allGood = false;
      }
      quotedNames.push(discriminatorType.quotedName);
    }
    if (allGood) {
      errors.push(
        ...checkNoAmbiguity(
          quotedNames.map((q) => ({
            text: q.text.slice(1, -1),
            start: q.start,
            end: q.end,
          })),
          { exactMatchIsConflict: true },
        ),
      );
    }
  }
}

function getDescForKind(kind: UnionKind): string {
  switch (kind) {
    case "good:strings":
      return "string";
    case "good:interfaces":
      return "interface";
    case "bad:array":
      return "array";
    case "bad:primitive":
      return "primitive";
    case "bad:union":
      return "union";
    case "error":
      return "error";
  }
}

function validateTypeName(name: TextSpan, errors: InternalError[]): void {
  if (!/^[A-Z][A-Za-z0-9]*$/.test(name.text)) {
    errors.push({
      span: name,
      message: WORD_MUST_START_WITH_UPPERCASE,
    });
  }
}

const WORD_MUST_START_WITH_UPPERCASE =
  "Must start with uppercase letter and contain only alphanumeric characters";
const WORD_MUST_START_WITH_LOWERCASE =
  "Must start with lowercase letter and contain only alphanumeric characters";

function collectNameDependencies(
  type: Type,
  typeDeclarations: { readonly [name: string]: TypeDeclaration },
  seenNames: Set<string>,
): null {
  switch (type.kind) {
    case "array": {
      return collectNameDependencies(
        type.elementType,
        typeDeclarations,
        seenNames,
      );
    }
    case "interface": {
      for (const field of Object.values(type.fields)) {
        collectNameDependencies(field.type, typeDeclarations, seenNames);
      }
      return null;
    }
    case "string-literal": {
      return null;
    }
    case "type-name": {
      const typeName = type.name.text;
      if (seenNames.has(typeName)) {
        return null;
      }
      seenNames.add(typeName);
      const resolved = typeDeclarations[typeName];
      if (!resolved) {
        return null;
      }
      return collectNameDependencies(
        resolved.valueType,
        typeDeclarations,
        seenNames,
      );
    }
    case "union": {
      for (const member of type.members) {
        collectNameDependencies(member, typeDeclarations, seenNames);
      }
      return null;
    }
  }
}

function verifyAllTypesUsed(
  rootTypeNames: readonly string[],
  types: { readonly [name: string]: TypeDeclaration },
): InternalError[] {
  const errors: InternalError[] = [];
  const usedTypes = new Set<string>();
  for (const rootTypeName of rootTypeNames) {
    const rootType = types[rootTypeName];
    if (rootType) {
      collectNameDependencies(rootType.valueType, types, usedTypes);
      usedTypes.add(rootTypeName);
    }
  }
  for (const type of Object.values(types)) {
    const { name } = type;
    if (!usedTypes.has(name.text)) {
      errors.push({
        span: name,
        message: `Type '${name.text}' is not used`,
      });
    }
  }
  return errors;
}

class TypeTraverser {
  static traverseAll(types: {
    readonly [name: string]: TypeDeclaration;
  }): TypeTraverser {
    const traverser = new TypeTraverser(types);
    for (const type of Object.values(types)) {
      traverser.traverse(
        type,
        type.kind === "type" && type.valueType.kind === "interface"
          ? { namePieces: [type.name.text], doc: type.doc }
          : { namePieces: [], doc: type.doc },
      );
    }
    return traverser;
  }

  private constructor(
    private readonly types: { readonly [name: string]: TypeDeclaration },
  ) {}

  private traverse(type: Type | TypeDeclaration, context: NamingHint): null {
    switch (type.kind) {
      case "array": {
        return this.traverse(type.elementType, context);
      }
      case "interface": {
        this.typeToNamingHint.set(type, context);
        const fields = Object.values(type.fields);
        for (const field of fields) {
          this.identifiers.add(field.name.text);
          const newContext: NamingHint = {
            namePieces: [...context.namePieces, field.name.text],
            doc: null,
          };
          this.traverse(field.type, newContext);
        }
        return null;
      }
      case "string-literal": {
        this.identifiers.add(type.value);
        return null;
      }
      case "type": {
        return this.traverse(type.valueType, context);
      }
      case "type-name": {
        return null;
      }
      case "union": {
        this.typeToNamingHint.set(type, context);
        const unionMembers = getUnionMembers(type, this.types);
        this.unionToMembers.set(type, unionMembers);
        switch (unionMembers.kind) {
          case "interfaces": {
            for (const [kind, member] of Object.entries(unionMembers.members)) {
              const newContext: NamingHint = {
                namePieces: [...context.namePieces, kind],
                doc: null,
              };
              this.traverse(member, newContext);
            }
            return null;
          }
          case "strings": {
            for (const member of unionMembers.members) {
              this.identifiers.add(member.value);
            }
            return null;
          }
        }
      }
    }
  }

  readonly identifiers: Set<string> = new Set();
  readonly unionToMembers = new Map<Union, UnionMembers>();
  readonly typeToNamingHint = new Map<Interface | Union, NamingHint>();
}
