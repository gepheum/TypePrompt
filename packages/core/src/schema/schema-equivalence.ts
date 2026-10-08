import type {
  BooleanLiteral,
  FieldType,
  Interface,
  Optional,
  PrimitiveType,
  RecordType,
  Array as SchemaArray,
  SchemaView,
  SharedTypeName,
  StringLiteral,
  TypeDeclarations,
  TypeName,
  Union,
} from "./schema-types.js";

export function schemasAreEquivalent(a: SchemaView, b: SchemaView): boolean {
  return typeDeclarationsAreEquivalent(a.typeDeclarations, b.typeDeclarations);
}

export function typeDeclarationsAreEquivalent(
  a: TypeDeclarations,
  b: TypeDeclarations,
): boolean {
  const aEntries = Object.entries(a);
  const bEntries = Object.entries(b);
  if (aEntries.length !== bEntries.length) {
    return false;
  }
  for (let i = 0; i < aEntries.length; i++) {
    const [aName, aDecl] = aEntries[i]!;
    const [bName, bDecl] = bEntries[i]!;
    if (aName !== bName || aDecl.name.text !== bDecl.name.text) {
      return false;
    }
    if (aDecl.doc !== bDecl.doc) {
      return false;
    }
    if (!typesAreEquivalent(aDecl.valueType, bDecl.valueType)) {
      return false;
    }
  }
  return true;
}

export function typesAreEquivalent(a: FieldType, b: FieldType): boolean {
  if (a.kind !== b.kind) {
    return false;
  }
  switch (a.kind) {
    case "any": {
      return true;
    }
    case "primitive": {
      const bPrimitive = b as PrimitiveType;
      return a.primitive.text === bPrimitive.primitive.text;
    }
    case "type-name": {
      const bTypeName = b as TypeName;
      return a.name.text === bTypeName.name.text;
    }
    case "shared-type-name": {
      const bSharedTypeName = b as SharedTypeName;
      return a.name.text === bSharedTypeName.name.text;
    }
    case "string-literal": {
      const bStringLiteral = b as StringLiteral;
      return a.value === bStringLiteral.value;
    }
    case "boolean-literal": {
      const bBooleanLiteral = b as BooleanLiteral;
      return a.value === bBooleanLiteral.value;
    }
    case "optional": {
      const bOptional = b as Optional;
      return typesAreEquivalent(a.innerType, bOptional.innerType);
    }
    case "array": {
      const bArray = b as SchemaArray;
      return typesAreEquivalent(a.elementType, bArray.elementType);
    }
    case "record": {
      const bRecord = b as RecordType;
      return (
        a.keyName === bRecord.keyName &&
        typesAreEquivalent(a.valueType, bRecord.valueType)
      );
    }
    case "interface": {
      const bInterface = b as Interface;
      const aFieldEntries = Object.entries(a.fields);
      const bFieldEntries = Object.entries(bInterface.fields);
      if (aFieldEntries.length !== bFieldEntries.length) {
        return false;
      }
      for (let i = 0; i < aFieldEntries.length; i++) {
        const [aFieldName, aField] = aFieldEntries[i]!;
        const [bFieldName, bField] = bFieldEntries[i]!;
        if (
          aFieldName !== bFieldName ||
          aField.name.text !== bField.name.text ||
          aField.doc !== bField.doc ||
          !typesAreEquivalent(aField.type, bField.type)
        ) {
          return false;
        }
      }
      return true;
    }
    case "union": {
      const bUnion = b as Union;
      if (a.members.length !== bUnion.members.length) {
        return false;
      }
      for (let i = 0; i < a.members.length; i++) {
        if (!typesAreEquivalent(a.members[i]!, bUnion.members[i]!)) {
          return false;
        }
      }
      return true;
    }
  }
}
