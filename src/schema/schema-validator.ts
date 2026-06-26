import { checkNoAmbiguity } from "../casing.js";
import type {
  SchemaParseError,
  SchemaSourceSpan,
  TypeDeclaration,
  TypeRef,
} from "./schema-types.js";

export function validateSchema(
  typeDeclarations: TypeDeclaration[],
): SchemaParseError[] {
  const errors: SchemaParseError[] = [];

  errors.push(
    ...checkNoAmbiguity(
      typeDeclarations.map((t) => ({
        name: t.name.text,
        start: t.name.start,
        end: t.name.end,
      })),
    ),
  );

  const types = Object.fromEntries(
    typeDeclarations.map((t) => [t.name.text, t]),
  );

  // TODO: check recursive types and cycles

  for (const typeDeclaration of typeDeclarations) {
    validateType(typeDeclaration, types);
  }

  return errors;
}

type UnionKind = "strings" | "interfaces" | "neither" | "error";

function getUnionKind(
  type: TypeRef,
  types: { readonly [name: string]: TypeDeclaration },
  seenNames: Set<string>,
): UnionKind {
  switch (type.kind) {
    case "string-literal":
      return "strings";
    case "inline-interface":
      return "interfaces";
    case "type-name": {
      if (seenNames.has(type.name.text)) {
        return "error";
      }
      seenNames.add(type.name.text);
      const typeDeclaration = types[type.name.text];
      if (!typeDeclaration) {
        return "error";
      } else if (typeDeclaration.kind === "interface") {
        return "interfaces";
      } else {
        return getUnionKind(typeDeclaration.valueType, types, seenNames);
      }
    }
    default:
      return "neither";
  }
}

function getFirstToken(type: TypeRef): SchemaSourceSpan {
  switch (type.kind) {
    case "array":
      return getFirstToken(type.elementType);
    case "inline-interface":
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
  type: TypeRef | TypeDeclaration,
  types: { readonly [name: string]: TypeDeclaration },
  errors: SchemaParseError[] = [],
): null {
  switch (type.kind) {
    case "array": {
      return validateType(type.elementType, types);
    }
    case "interface": {
      validateTypeName(type.name, errors);
      // fallthrough
    }
    case "inline-interface": {
      errors.push(
        ...checkNoAmbiguity(
          Object.values(type.fields).map((f) => ({
            name: f.name.text,
            start: f.name.start,
            end: f.name.end,
          })),
        ),
      );
      for (const field of Object.values(type.fields)) {
        if (!/^[a-z][A-Za-z0-9]*$/.test(field.name.text)) {
          errors.push({
            start: field.name.start,
            end: field.name.end,
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
          start: type.quotedName.start + 1,
          end: type.quotedName.end - 1,
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
      const isPrimitive = PRIMITIVE_TYPES.has(typeName);
      if (!isPrimitive && !types[typeName]) {
        errors.push({
          start: type.name.start,
          end: type.name.end,
          message: `Unknown type '${typeName}'`,
        });
      }
      return null;
    }
    case "union": {
      const { members } = type;
      for (const member of members) {
        validateType(member, types, errors);
      }
      // Make sure 'members' are either all string literals or all interfaces.
      const first = members[0]!;
      const unionKind = getUnionKind(first, types, new Set());
      if (unionKind === "neither") {
        const firstToken = getFirstToken(first);
        errors.push({
          start: firstToken.start,
          end: firstToken.end,
          message:
            "Union members must be either all strings or all interfaces",
        });
      }
      return null;
    }
  }
};

function validateTypeName(name: SchemaSourceSpan, errors: SchemaParseError[]): void {
  if (!/^[A-Z][A-Za-z0-9]*$/.test(name.text)) {
    errors.push({
      start: name.start,
      end: name.end,
      message: WORD_MUST_START_WITH_UPPERCASE,
    });
  }
};

const PRIMITIVE_TYPES: ReadonlySet<string> = new Set(["string", "number", "boolean"]);

const WORD_MUST_START_WITH_UPPERCASE =
  "Must start with uppercase letter and contain only alphanumeric characters";
const WORD_MUST_START_WITH_LOWERCASE =
  "Must start with lowercase letter and contain only alphanumeric characters";
