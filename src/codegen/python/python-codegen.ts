// TODO: pydoc
// TODO: field name: lowercase, avoid keywords, avoid conflcit with pydantic generated symbols...

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
    "from typing import Annotated, Literal, Optional, Union, final",
    "from pydantic import BaseModel, Field\n\n",
    scaleIndenting(writeSchemas(compilationResult)),
  ].join("\n");
}

function writeSchemas(compilationResult: ValidCompilationResult): string {
  const lines = [
    "@final",
    "class schema:",
    " @final",
    " class meta:",
    writeSchema(compilationResult.metaSchema, {
      typePrefix: "schema.meta.",
      indent: "  ",
      requiredTypes: ["Meta"],
    }),
  ];
  for (const namespace of Object.values(compilationResult.namespaces)) {
    if (
      namespace.schema.namingHints.defaultScope.size <= 0 &&
      namespace.templates.length <= 0 &&
      Object.keys(namespace.tools).length <= 0
    ) {
      continue;
    }
    const namespaceName: string = namespace.name;
    lines.push(` @final`);
    lines.push(` class ${namespaceName}:`);
    if (namespace.schema.namingHints.defaultScope.size >= 1) {
      lines.push(`  @final`);
      lines.push("  class shared:");
      lines.push(
        writeSchema(namespace.schema, {
          typePrefix: `schema.${namespaceName}.shared.`,
          indent: "  ",
        }),
      );
    }
    for (const template of namespace.templates) {
      const templateName: string = template.template.name.text;
      lines.push(`  @final`);
      lines.push(`  class ${templateName}:`);
      lines.push(
        writeSchema(template.schema, {
          typePrefix: `schema.${namespaceName}.${templateName}.`,
          sharedTypePrefix: `schema.${namespaceName}.shared.`,
          indent: "   ",
          requiredTypes: ["Input", "Output"],
        }),
      );
    }
    for (const tool of Object.values(namespace.tools)) {
      const toolName: string = tool.tool.name.text;
      lines.push(`  @final`);
      lines.push(`  class ${toolName}:`);
      lines.push(
        writeSchema(tool.schema, {
          typePrefix: `schema.${namespaceName}.${toolName}.`,
          sharedTypePrefix: `schema.${namespaceName}.shared.`,
          indent: "   ",
          requiredTypes: ["Input", "Output"],
        }),
      );
    }
  }
  return lines.join("\n");
}

function writeSchema(
  schema: Schema,
  options: {
    readonly typePrefix: string;
    readonly sharedTypePrefix?: string;
    readonly indent: " " | "  " | "   ";
    readonly requiredTypes?: readonly string[];
  },
): string {
  const lines: string[] = [];
  for (const [type, namingHint] of schema.namingHints.defaultScope.entries()) {
    const name = makeNameFromHint(namingHint);
    switch (type.kind) {
      case "interface": {
        lines.push(`class ${name}(BaseModel):`);
        if (Object.keys(type.fields).length <= 0) {
          lines.push(" pass");
        }
        for (const field of Object.values(type.fields)) {
          const type = writeType(
            resolveFieldType(field, schema),
            schema,
            options,
          );
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
            lines.push(` Field(discriminator="${members.discriminator}"),`);
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
    lines.push(...["", ""]);
  }

  for (const requiredType of options.requiredTypes ?? []) {
    const declaration = schema.typeDeclarations[requiredType];
    if (declaration) {
      if (
        declaration.valueType.kind !== "interface" &&
        declaration.valueType.kind !== "union"
      ) {
        const type = writeType(declaration.valueType, schema, options);
        lines.push(`type ${requiredType} = ${type}`);
        lines.push(...["", ""]);
      }
    } else {
      lines.push(`type ${requiredType} = Literal[None]`);
      lines.push(...["", ""]);
    }
  }

  const { indent } = options;
  return lines
    .map((line) => (line.length <= 0 ? line : indent.concat(line)))
    .join("\n");
}

function writeType(
  type: Type | NullableType,
  schema: Schema,
  options: {
    readonly typePrefix: string;
    readonly sharedTypePrefix?: string;
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
      const typePrefix = shared
        ? options.sharedTypePrefix!
        : options.typePrefix;
      if (!typePrefix) throw new Error();
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

function scaleIndenting(input: string): string {
  return input.replace(/^ +/gm, (match) => match.repeat(2));
}
