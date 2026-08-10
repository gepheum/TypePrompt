import type { ValidCompilationResult } from "../../compiler/compiler-types.js";
import type { Config } from "../../config/config-parser.js";
import { NamingHint, Schema } from "../../schema/schema-types.js";
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
  return writeSchema(compilationResult.metaSchema, {
    typePrefix: "T_",
    sharedTypePrefix: "T_",
  });
}

function writeSchema(
  schema: Schema,
  context: {
    readonly typePrefix: string;
    readonly sharedTypePrefix: string;
  },
): string {
  const { typePrefix, sharedTypePrefix } = context;

  const lines: string[] = [];
  // for (const [type, namingHint] of schema.typeToNamingHint.entries()) {
  //   const name = typePrefix.concat(join(namingHint));
  //   // TODO: pydoc
  //   switch (type.kind) {
  //     case "interface": {
  //       lines.push(`class ${name}:`);
  //       lines.push(" pass");
  //       break;
  //     }
  //     case "union": {
  //       lines.push(`type ${name} = Union[`);
  //       lines.push("]");
  //       break;
  //     }
  //   }
  // }

  // TODO: possibly output alias for Input, Output, Meta...

  return lines.join("\n");
}

// function writeType(
//   type: Type,
//   context: {
//     readonly schema: Schema;
//     readonly nameScope: NameScope;
//     readonly typePrefix: string;
//     readonly sharedTypePrefix: string;
//   },
// ): string {
//   switch (type.kind) {
//     case "any": {
//       return "Any";
//     }
//     case "array": {
//       const { elementType } = type;
//       const writtenElement = writeType(elementType, context);
//       return `Sequence[${writtenElement}]`;
//     }
//     case "boolean-literal": {
//       return type.value ? "Literal[True]" : "Literal[False]";
//     }
//     case "interface":
//     case "union": {
//       const namingHint = context.schema.typeToNamingHint.get(type)!;
//       const fields = Object.entries(type.fields);
//       if (fields.length <= 0) {
//         return "{}";
//       }
//       let result = "{\n";
//       for (const [fieldName, field] of fields) {
//         result += [
//           wrapJsdoc(field.doc),
//           "readonly ",
//           fieldName,
//           field.optional ? "?: " : ": ",
//           writeType(field.type, options),
//           ";\n",
//         ].join("");
//       }
//       result += "}";
//       return result;
//     }
//     case "primitive": {
//       if (type.primitive.text === "integer") {
//         return "number";
//       } else {
//         return type.primitive.text;
//       }
//     }
//     case "record": {
//       return `{ [${type.keyName}: string]: ${writeType(type.valueType, options)} }`;
//     }
//     case "shared-type-name": {
//       return options.sharedTypePrefix.concat(type.name.text);
//     }
//     case "string-literal": {
//       return type.quotedName.text;
//     }
//     case "type-name": {
//       return type.name.text;
//     }
//     case "union": {
//       return "(\n"
//         .concat(
//           type.members.map((m) => `| ${writeType(m, options)}\n`).join(""),
//         )
//         .concat(")");
//     }
//   }
// }

function makeNameFromHint(hint: NamingHint): string {
  return hint.namePieces
    .map((piece) => {
      switch (piece.kind) {
        case "type":
        case "field":
          return piece.name;
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
