import { checkNameConflicts } from "../util/casing.js";
import type {
  ErrorSink,
  InternalError,
  InternalErrors,
  TextSpan,
} from "../util/shared-types.js";
import { EMPTY_SCHEMA } from "./empty-schema.js";
import type {
  FieldType,
  Interface,
  NamingHint,
  Schema,
  SchemaParseResult,
  SchemaValidationContext,
  SchemaView,
  Type,
  TypeDeclaration,
  Union,
  UnionMembers,
} from "./schema-types.js";
import { getNameDependencies, NameDependencies } from "./schema-utils.js";
import { computeUnionMembers } from "./unions.js";

export function validateSchema(
  schema: SchemaParseResult,
  context: SchemaValidationContext,
): Schema | InternalErrors {
  const { typeDeclarations } = schema;

  const errors: InternalError[] = [];

  const namespaceSchema = ((): Schema => {
    switch (context.kind) {
      case "template":
      case "tool":
        return context.namespaceSchema;
      case "meta":
      case "namespace":
        return EMPTY_SCHEMA;
    }
  })();

  const schemaView: SchemaView = {
    typeDeclarations: typeDeclarations,
    sharedDeclarations: namespaceSchema.typeDeclarations,
  };

  const unionToMembers =
    context.kind === "template"
      ? new Map(context.namespaceSchema.unionToMembers)
      : new Map<Union, UnionMembers>();
  for (const typeDeclaration of Object.values(typeDeclarations)) {
    const { name } = typeDeclaration;
    validateType(typeDeclaration, schemaView, context, unionToMembers, errors);
    const nameDependencies = getNameDependencies(
      typeDeclaration.valueType,
      "defaultScope",
      schemaView,
      "cycle-detection",
    );
    if (nameDependencies.defaultScope.has(name.text)) {
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
      case "tool":
        return ["Input", "Output"];
    }
  })();
  for (const requiredTypeName of requiredTypeNames) {
    const requiredType = typeDeclarations[requiredTypeName];
    if (!requiredType) {
      errors.push({
        span: {
          start: schema.sourcePosition,
          end: schema.sourcePosition,
        },
        message: `Missing required type '${requiredTypeName}'`,
      });
    }
  }

  if (errors.length >= 1) {
    return { kind: "error", errors };
  }

  // Verify that all types are used.
  let sharedNames: ReadonlySet<string> = new Set();
  if (context.kind !== "namespace") {
    const allTypesUsedResult = verifyAllTypesUsed(
      requiredTypeNames,
      schemaView,
    );
    errors.push(...allTypesUsedResult.errors);
    sharedNames = allTypesUsedResult.nameDependencies.shared;
  }

  if (errors.length >= 1) {
    return { kind: "error", errors };
  }

  const identifiers = collectIdentifiers(schemaView, sharedNames);
  const namingHints = {
    defaultScope: collectNamingHints(schemaView, unionToMembers),
    shared: namespaceSchema.namingHints.defaultScope,
  } as const;

  return {
    ...schemaView,
    kind: "success",
    identifiers,
    unionToMembers,
    namingHints,
  };
}

function validateType(
  type: Type | TypeDeclaration,
  schema: SchemaView,
  context: SchemaValidationContext,
  unionToMembers: Map<Union, UnionMembers>,
  errors: ErrorSink,
): void {
  function validate(type: FieldType | TypeDeclaration): null {
    switch (type.kind) {
      case "any":
      case "boolean-literal":
      case "primitive": {
        return null;
      }
      case "array": {
        return validate(type.elementType);
      }
      case "interface": {
        errors.push(
          ...checkNameConflicts(Object.values(type.fields).map((f) => f.name)),
        );
        for (const field of Object.values(type.fields)) {
          if (!/^[a-z][A-Za-z0-9]*$/.test(field.name.text)) {
            errors.push({
              span: field.name,
              message: WORD_MUST_START_WITH_LOWERCASE,
            });
          }
          validate(field.type);
        }
        return null;
      }
      case "optional": {
        return validate(type.innerType);
      }
      case "record": {
        return validate(type.valueType);
      }
      case "string-literal": {
        const { value } = type;
        if (!/^[A-Za-z]/.test(value)) {
          errors.push({
            span: {
              start: type.quotedName.start + 1,
              end: type.quotedName.end - 1,
            },
            message: "String must start with a letter",
          });
        } else if (!/^[A-Za-z0-9_\-./]+$/.test(value)) {
          errors.push({
            span: {
              start: type.quotedName.start + 1,
              end: type.quotedName.end - 1,
            },
            message:
              "String must only contain letters, digits, or allowed symbols (_ - . /)",
          });
        }
        return null;
      }
      case "type": {
        validateTypeName(type.name, errors);
        return validate(type.valueType);
      }
      case "type-name": {
        const typeName = type.name.text;
        if (!schema.typeDeclarations[typeName]) {
          errors.push({
            span: type.name,
            message: `Unknown type '${typeName}'`,
            suggestions: Object.keys(schema.typeDeclarations),
          });
        }
        return null;
      }
      case "shared-type-name": {
        if (context.kind === "namespace" || context.kind === "meta") {
          errors.push({
            span: type.shared,
            message: `'shared' not allowed inside <${context.kind}> elements`,
          });
          return null;
        }
        const typeName = type.name.text;
        const { typeDeclarations } = context.namespaceSchema;
        if (!typeDeclarations[typeName]) {
          errors.push({
            span: type.name,
            message: `Unknown type '${typeName}'`,
            suggestions: Object.keys(typeDeclarations),
          });
        }
        return null;
      }
      case "union": {
        for (const member of type.members) {
          validate(member);
        }
        const members = computeUnionMembers(type, schema);
        if (members.kind === "error") {
          errors.push(...members.errors);
        } else {
          unionToMembers.set(type, members);
        }
        return null;
      }
    }
  }
  validate(type);
}

function validateTypeName(name: TextSpan, errors: ErrorSink): void {
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

function verifyAllTypesUsed(
  rootTypeNames: readonly string[],
  schema: SchemaView,
): {
  readonly errors: InternalError[];
  readonly nameDependencies: NameDependencies;
} {
  const errors: InternalError[] = [];
  const rootTypes: Type[] = [];
  for (const rootTypeName of rootTypeNames) {
    const rootType = schema.typeDeclarations[rootTypeName];
    if (rootType) {
      rootTypes.push(rootType.valueType);
    }
  }
  const nameDependencies = getNameDependencies(
    { kind: "types", types: rootTypes },
    "defaultScope",
    schema,
    "recursive",
  );
  for (const type of Object.values(schema.typeDeclarations)) {
    const { name } = type;
    if (rootTypeNames.includes(name.text)) continue;
    if (!nameDependencies.defaultScope.has(name.text)) {
      errors.push({
        span: name,
        message: `Type '${name.text}' is not used`,
      });
    }
  }
  return { errors, nameDependencies };
}

function collectIdentifiers(
  schema: SchemaView,
  sharedNames: ReadonlySet<string>,
): ReadonlySet<string> {
  const identifiers = new Set<string>();

  const collect = (type: FieldType | TypeDeclaration): null => {
    switch (type.kind) {
      case "any":
      case "boolean-literal":
      case "primitive": {
        return null;
      }
      case "array": {
        return collect(type.elementType);
      }
      case "interface": {
        for (const field of Object.values(type.fields)) {
          identifiers.add(field.name.text);
          collect(field.type);
        }
        return null;
      }
      case "optional": {
        return collect(type.innerType);
      }
      case "record": {
        return collect(type.valueType);
      }
      case "shared-type-name":
      case "type-name": {
        return null;
      }
      case "string-literal": {
        identifiers.add(type.value);
        return null;
      }
      case "type": {
        return collect(type.valueType);
      }
      case "union": {
        for (const member of type.members) {
          collect(member);
        }
        return null;
      }
    }
  };

  for (const type of Object.values(schema.typeDeclarations)) {
    collect(type.valueType);
  }
  for (const sharedName of sharedNames) {
    const sharedType = schema.sharedDeclarations[sharedName]!;
    collect(sharedType.valueType);
  }

  return identifiers;
}

function collectNamingHints(
  schema: SchemaView,
  unionToMembers: ReadonlyMap<Union, UnionMembers>,
): ReadonlyMap<Interface | Union, NamingHint> {
  const typeToNamingHint = new Map<Interface | Union, NamingHint>();

  const collect = (type: FieldType, context: NamingHint): null => {
    switch (type.kind) {
      case "any":
      case "boolean-literal":
      case "primitive":
      case "string-literal": {
        return null;
      }
      case "array": {
        return collect(type.elementType, context);
      }
      case "interface": {
        typeToNamingHint.set(type, context);
        const fields = Object.values(type.fields);
        for (const field of fields) {
          const newContext: NamingHint = {
            namePieces: [
              ...context.namePieces,
              { kind: "field", name: field.name.text },
            ],
            doc: "",
          };
          collect(field.type, newContext);
        }
        return null;
      }
      case "optional": {
        return collect(type.innerType, context);
      }
      case "record": {
        return collect(type.valueType, context);
      }
      case "type-name":
      case "shared-type-name": {
        return null;
      }
      case "union": {
        typeToNamingHint.set(type, context);
        const unionMembers = unionToMembers.get(type)!;
        switch (unionMembers.kind) {
          case "interfaces": {
            const discriminantType = unionMembers.discriminants.type;
            for (const [discriminant, member] of Object.entries(
              unionMembers.members,
            )) {
              const newContext: NamingHint = {
                namePieces: [
                  ...context.namePieces,
                  {
                    kind: "member",
                    discriminator: unionMembers.discriminator,
                    discriminant:
                      discriminantType === "string"
                        ? {
                            type: discriminantType,
                            value: discriminant,
                          }
                        : {
                            type: discriminantType,
                            value: discriminant === "true",
                          },
                  },
                ],
                doc: "",
              };
              collect(member.unresolved, newContext);
            }
            return null;
          }
          case "strings": {
            return null;
          }
        }
      }
    }
  };

  for (const type of Object.values(schema.typeDeclarations)) {
    collect(type.valueType, {
      namePieces: [{ kind: "type", name: type.name.text }],
      doc: type.doc,
    });
  }

  return typeToNamingHint;
}
