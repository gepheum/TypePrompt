import { checkNameConflicts } from "../util/casing.js";
import type {
  ErrorSink,
  InternalError,
  InternalErrors,
  TextSpan,
} from "../util/shared-types.js";
import type {
  Interface,
  NamingHint,
  Schema,
  SchemaValidationContext,
  SchemaView,
  Type,
  TypeDeclaration,
  Union,
  UnionMembers,
} from "./schema-types.js";
import { getNameDependencies } from "./schema-utils.js";
import { computeUnionMembers } from "./unions.js";

export function validateSchema(
  typeDeclarations: { readonly [name: string]: TypeDeclaration },
  context: SchemaValidationContext,
): Schema | InternalErrors {
  const errors: InternalError[] = [];

  const schemaView: SchemaView = {
    typeDeclarations: typeDeclarations,
    sharedDeclarations:
      context.kind === "template"
        ? context.namespaceSchema.typeDeclarations
        : null,
  };

  for (const typeDeclaration of Object.values(typeDeclarations)) {
    const { name } = typeDeclaration;
    validateType(typeDeclaration, schemaView, context, errors);
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
    errors.push(...verifyAllTypesUsed(requiredTypeNames, schemaView));
  }

  if (errors.length > 0) {
    return {
      kind: "error",
      errors: errors,
    };
  }

  const typeTraverser = TypeTraverser.traverseAll(schemaView);

  return {
    ...schemaView,
    kind: "success",
    identifiers: typeTraverser.identifiers,
    unionToMembers: typeTraverser.unionToMembers,
    typeToNamingHint: typeTraverser.typeToNamingHint,
  };
}

function validateType(
  type: Type | TypeDeclaration,
  schema: SchemaView,
  context: SchemaValidationContext,
  errors: ErrorSink,
): null {
  switch (type.kind) {
    case "any":
    case "primitive": {
      return null;
    }
    case "array": {
      return validateType(type.elementType, schema, context, errors);
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
        validateType(field.type, schema, context, errors);
      }
      return null;
    }
    case "record": {
      return validateType(type.valueType, schema, context, errors);
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
      return validateType(type.valueType, schema, context, errors);
    }
    case "type-name": {
      const typeName = type.name.text;
      if (!schema.typeDeclarations[typeName]) {
        errors.push({
          span: type.name,
          message: `Unknown type '${typeName}'`,
        });
      }
      return null;
    }
    case "shared-type-name": {
      if (context.kind !== "template") {
        errors.push({
          span: type.shared,
          message: `'shared' not allowed inside <${context.kind}> elements`,
        });
        return null;
      }
      const typeName = type.name.text;
      if (!context.namespaceSchema.typeDeclarations[typeName]) {
        errors.push({
          span: type.name,
          message: `Unknown type '${typeName}'`,
        });
      }
      return null;
    }
    case "union": {
      const members = computeUnionMembers(type, schema);
      if (members.kind === "error") {
        errors.push(...members.errors);
      }
      return null;
    }
  }
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
): InternalError[] {
  const errors: InternalError[] = [];
  const usedTypes = new Set<string>();
  for (const rootTypeName of rootTypeNames) {
    const rootType = schema.typeDeclarations[rootTypeName];
    if (rootType) {
      usedTypes.add(rootTypeName);
      const nameDependencies = getNameDependencies(
        rootType.valueType,
        "defaultScope",
        schema,
        "recursive",
      );
      nameDependencies.defaultScope.forEach((n) => usedTypes.add(n));
    }
  }
  for (const type of Object.values(schema.typeDeclarations)) {
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
  static traverseAll(schema: SchemaView): TypeTraverser {
    const traverser = new TypeTraverser(schema);
    for (const type of Object.values(schema.typeDeclarations)) {
      traverser.traverse(
        type,
        type.kind === "type" && type.valueType.kind === "interface"
          ? {
              namePieces: [{ kind: "type", name: type.name.text }],
              doc: type.doc,
            }
          : { namePieces: [], doc: type.doc },
      );
    }
    return traverser;
  }

  private constructor(private readonly schema: SchemaView) {}

  private traverse(type: Type | TypeDeclaration, context: NamingHint): null {
    switch (type.kind) {
      case "any":
      case "primitive": {
        return null;
      }
      case "array": {
        return this.traverse(type.elementType, context);
      }
      case "interface": {
        this.typeToNamingHint.set(type, context);
        const fields = Object.values(type.fields);
        for (const field of fields) {
          this.identifiers.add(field.name.text);
          const newContext: NamingHint = {
            namePieces: [
              ...context.namePieces,
              { kind: "field", name: field.name.text },
            ],
            doc: null,
          };
          this.traverse(field.type, newContext);
        }
        return null;
      }
      case "record": {
        return this.traverse(type.valueType, context);
      }
      case "string-literal": {
        this.identifiers.add(type.value);
        return null;
      }
      case "type": {
        return this.traverse(type.valueType, context);
      }
      case "type-name":
      case "shared-type-name": {
        return null;
      }
      case "union": {
        this.typeToNamingHint.set(type, context);
        const unionMembers = computeUnionMembers(type, this.schema);
        if (unionMembers.kind === "error") {
          throw new Error(JSON.stringify(unionMembers));
        }
        this.unionToMembers.set(type, unionMembers);
        switch (unionMembers.kind) {
          case "interfaces": {
            for (const [kind, member] of Object.entries(unionMembers.members)) {
              const newContext: NamingHint = {
                namePieces: [
                  ...context.namePieces,
                  {
                    kind: "member",
                    discriminantName: unionMembers.discriminator,
                    discriminantVal: kind,
                  },
                ],
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
