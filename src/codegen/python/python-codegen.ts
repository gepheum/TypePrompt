// TODO: pydoc
// TODO: I think I can just store the namespaces like this: class schema: class meta: /* schema definition */
// TODO: optional fields...
// TODO: field name: lowercase, avoid keywords
// TODO: pydantic

import type { ValidCompilationResult } from "../../compiler/compiler-types.js";
import type { Config } from "../../config/config-parser.js";
import { NullableType } from "../../expression/expression-types.js";
import { resolveFieldType } from "../../expression/get-field-type.js";
import { NamingHint, Schema, Type } from "../../schema/schema-types.js";
import { capitalize } from "../../util/casing.js";
import type { OutputFile } from "../codegen-types.js";

export function generatePythonCode(
  compilationResult: ValidCompilationResult,
  config: Config,
): readonly OutputFile[] {
  const pyConfig = config.gen.python;
  if (!pyConfig || pyConfig.enabled === false) {
    return [];
  }
  return [
    {
      path: pyConfig.file,
      content: writeAll(compilationResult),
    },
  ];
}

function writeAll(compilationResult: ValidCompilationResult): string {
  return [
    "from typing import Annotated, Literal, Optional, Union",
    "from pydantic import BaseModel, Field\n\n",
    writeSchema(compilationResult.metaSchema, {
      typePrefix: "T_",
      sharedTypePrefix: "T_",
    }),
  ].join("\n");
}

function writeSchema(
  schema: Schema,
  options: {
    readonly typePrefix: string;
    readonly sharedTypePrefix: string;
  },
): string {
  const { typePrefix, sharedTypePrefix } = options;

  const lines: string[] = [];
  for (const [type, namingHint] of schema.namingHints.defaultScope.entries()) {
    const name = typePrefix.concat(makeNameFromHint(namingHint));
    switch (type.kind) {
      case "interface": {
        lines.push(`class ${name}(BaseModel):`);
        if (Object.keys(type.fields).length <= 0) {
          lines.push(" pass");
        }
        for (const field of Object.values(type.fields)) {
          const type = writeType(
            resolveFieldType(field, schema), schema, options);
          lines.push(` ${field.name.text}: ${type}`);
        }
        break;
      }
      case "union": {
        const members = schema.unionToMembers.get(type)!;
        switch (members.kind) {
          case "interfaces": {
            lines.push(`type ${name} = Annotated[`);
            lines.push(" Union[");
            for (const member of Object.values(members.members)) {
              const memberType = writeType(member, schema, options);
              lines.push(`  ${memberType},`);
            }
            lines.push(" ],");
            lines.push(` Field(discriminator="${members.discriminator}")`);
            lines.push("]");
            break;
          }
          case "strings": {
            lines.push(`type ${name} = Literal[`);
            for (const member of Object.values(members.members)) {
              lines.push(` '${member.value}',`);
            }
            lines.push("]");
            break;
          }
          default: {
            throw new Error(members satisfies never);
          }
        }
        break;
      }
      default: {
        throw new Error(type satisfies never);
      }
    }
    lines.push("");
    lines.push("");
  }

  // TODO: possibly output alias for Input, Output, Meta...

  return lines.join("\n");
}

function writeType(
  type: Type | NullableType,
  schema: Schema,
  options: {
    readonly typePrefix: string;
    readonly sharedTypePrefix: string;
  },
): string {
  switch (type.kind) {
    case "any": {
      return "Any";
    }
    case "array": {
      const { elementType } = type;
      const writtenElement = writeType(elementType, schema, options);
      return `list[${writtenElement}]`;
    }
    case "boolean-literal": {
      return type.value ? "Literal[True]" : "Literal[False]";
    }
    case "interface":
    case "union": {
      let namingHint = schema.namingHints.defaultScope.get(type);
      let shared: boolean;
      if (namingHint) {
        shared = false;
      } else {
        namingHint = schema.namingHints.shared.get(type);
        shared = true;
      }
      const typePrefix = shared ? options.sharedTypePrefix : options.typePrefix;
      const typeName = typePrefix.concat(makeNameFromHint(namingHint!));
      return `'${typeName}'`;
    }
    case "nullable": {
      const valueType = writeType(type.type, schema, options);
      return `Optional[${valueType}]`;
    }
    case "primitive": {
      switch (type.primitive.text) {
        case "boolean":
          return "bool";
        case "integer":
          return "int";
        case "number":
          return "float";
        case "string":
          return "str";
        default:
          throw new Error(type.primitive.text satisfies never);
      }
    }
    case "record": {
      const valueType = writeType(type.valueType, schema, options);
      return `dict[str, ${valueType}]`;
    }
    case "shared-type-name": {
      const declaration = schema.sharedDeclarations[type.name.text]!;
      return writeType(declaration.valueType, schema, options);
    }
    case "string-literal": {
      return `Literal['${type.value}']`;
    }
    case "type-name": {
      const declaration = schema.typeDeclarations[type.name.text]!;
      return writeType(declaration.valueType, schema, options);
    }
  }
}

function makeNameFromHint(hint: NamingHint): string {
  return hint.namePieces
    .map((piece) => {
      switch (piece.kind) {
        case "type":
          return piece.name;
        case "field":
          return capitalize(piece.name);
        case "member": {
          switch (piece.discriminant.type) {
            case "string":
              return capitalize(piece.discriminator).concat(
                capitalize(piece.discriminant.value),
              );
            case "boolean":
              return (piece.discriminant.value ? "" : "Not").concat(
                capitalize(piece.discriminator),
              );
          }
        }
      }
    })
    .join("_");
}
