import type {
  ValidCompilationResult,
  ValidNamespaceResult,
  ValidatedTool,
} from "../../compiler/compiler-types.js";
import { DEFAULT_NAMESPACE } from "../../compiler/default-namespace.js";
import { getId } from "../../compiler/ids.js";
import type { Config } from "../../config/config-parser.js";
import { runtimeTypesSchema } from "../../runtime/runtime-types-schema.js";
import { makeTemplates } from "../../runtime/spec-maker.js";
import type {
  FieldType,
  Interface,
  NamingHint,
  Schema,
  TypeNameView,
  Union,
} from "../../schema/schema-types.js";
import { isLiteralType } from "../../schema/schema-utils.js";
import { resolveType } from "../../schema/type-resolver.js";
import { STATIC_SNIPPETS } from "../../static-snippets/static-snippets.gen.js";
import { capitalize, toPascalCase, toSnakeCase } from "../../util/casing.js";
import type { OutputFile } from "../codegen-types.js";

export function generateRustCode(
  compilationResult: ValidCompilationResult,
  config: Config,
): readonly OutputFile[] {
  const rustConfig = config.gen?.rust;
  if (!rustConfig) {
    return [];
  }
  return [
    {
      path: rustConfig.file,
      content: writeAll(compilationResult),
    },
  ];
}

function writeAll(compilationResult: ValidCompilationResult): string {
  return coalesceEmptyLines(
    reformat(
      [
        STATIC_SNIPPETS["rust-imports"],
        // reformat(writePromptsInterface(compilationResult)),
        STATIC_SNIPPETS["rust-public-types"],
        writeTemplateIdEnum(compilationResult),
        writeToolExecutorTraits(compilationResult),
        writeUserDefinedDatatypes(compilationResult),
        writeSpecDatatypes(),
        writeTemplatesData(compilationResult),
        writeExecuteToolCall(compilationResult),
        STATIC_SNIPPETS["rust-logic"],
      ].join("\n\n"),
    ),
  ).concat("\n");
}

// function writePromptsInterface(
//   compilationResult: ValidCompilationResult,
// ): string {
//   const writeTemplates = (namespace: ValidNamespaceResult): string => {
//     const { templates } = namespace;
//     if (templates.length <= 0) {
//       return "ReadonlyRecord<string, never>";
//     } else {
//       return [
//         "{",
//         ...Object.values(
//           namespace.templates.map((t) =>
//             [
//               "// Defined in '",
//               t.template.sourcePath,
//               "'\nreadonly ",
//               uncapitalize(t.template.name.text),
//               ': Template<"',
//               getId(t.template),
//               '">;',
//             ].join(""),
//           ),
//         ),
//         "}",
//       ].join("\n");
//     }
//   };
//   const lines = ["/** Entry point for building prompts. */"];
//   if (compilationResult.singleNamespace) {
//     const templates = writeTemplates(compilationResult.singleNamespace);
//     lines.push(`export type Prompts = ${templates};`);
//   } else {
//     lines.push("export type Prompts = {");
//     for (const namespace of Object.values(compilationResult.namespaces)) {
//       const namespaceName = uncapitalize(namespace.name);
//       const templates = writeTemplates(namespace);
//       lines.push(`readonly ${namespaceName}: ${templates};`);
//     }
//     lines.push("};");
//   }
//   return lines.join("\n");
// }

function writeTemplateIdEnum(
  compilationResult: ValidCompilationResult,
): string {
  const { singleNamespace, templates } = compilationResult;
  const lines = [
    "/// Uniquely identifies a prompt template.",
    "#[derive(Debug, PartialEq, Eq, Hash, Clone, Copy)]",
    "pub enum TemplateId {",
  ];
  for (const template of Object.values(templates)) {
    const namespace = template.template.namespace?.text ?? DEFAULT_NAMESPACE;
    const templateName = template.template.name.text;
    const rawMemberName = singleNamespace
      ? templateName
      : `${namespace}_${templateName}`;
    const variantName = toRustName(rawMemberName);
    lines.push(`${variantName},`);
  }
  const templateList = Object.values(templates);
  if (templateList.length <= 0) {
    lines.push(
      "}",
      "",
      "impl TemplateId {",
      "pub const fn as_str(&self) -> &'static str {",
      "match *self {}",
      "}",
      "}",
      "",
    );
  } else {
    lines.push(
      "}",
      "",
      "impl TemplateId {",
      "pub const fn as_str(&self) -> &'static str {",
      "match self {",
    );
    for (const template of templateList) {
      const namespace = template.template.namespace?.text ?? DEFAULT_NAMESPACE;
      const templateName = template.template.name.text;
      const rawMemberName = singleNamespace
        ? templateName
        : `${namespace}_${templateName}`;
      const variantName = toRustName(rawMemberName);
      const templateId = getId(template.template);
      lines.push(`TemplateId::${variantName} => "${templateId}",`);
    }
    lines.push("}", "}", "}", "");
  }
  lines.push(
    "impl std::fmt::Display for TemplateId {",
    "fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {",
    'write!(f, "{}", self.as_str())',
    "}",
    "}",
  );
  return lines.join("\n");
}

function writeToolExecutorTraits(
  compilationResult: ValidCompilationResult,
): string {
  const { singleNamespace, namespaces } = compilationResult;

  const writeNamespace = (
    namespace: ValidNamespaceResult,
  ): readonly string[] => {
    const lines: string[] = [];
    const namespaceName = toRustName(namespace.name);
    const typePrefixBase = singleNamespace
      ? "super::schema::"
      : `super::super::schema::${namespaceName}::`;
    const sharedTypePrefix = typePrefixBase.concat("shared::");

    for (const tool of Object.values(namespace.tools)) {
      const toolName = tool.tool.name.text;
      const interfaceName = toRustName(capitalize(toolName));
      const toolTypeName = toRustName(capitalize(toolName));
      const toolTypePrefix = typePrefixBase.concat(toolTypeName, "::");
      const options: WriteSchemaOptions = {
        typePrefix: toolTypePrefix,
        sharedTypePrefix,
        topLevel: true,
      };
      const inputType = writeType(
        { kind: "type-name", name: { text: "Input" } },
        tool.schema,
        options,
      );
      const outputType = writeType(
        { kind: "type-name", name: { text: "Output" } },
        tool.schema,
        options,
      );

      const methodName = toRustName(toSnakeCase(toolName));
      lines.push(
        `/// Tool executor interface for the '${toolName}' tool.`,
        `pub trait ${interfaceName} {`,
        `async fn ${methodName}(`,
        "&self,",
        `input: ${inputType},`,
        `) -> ${outputType};`,
        "}",
        "",
        `impl<T: ?Sized + ${interfaceName}> ${interfaceName} for &T {`,
        `async fn ${methodName}(`,
        "&self,",
        `input: ${inputType},`,
        `) -> ${outputType} {`,
        `(**self).${methodName}(input).await`,
        "}",
        "}",
        "",
        `impl<T: ?Sized + ${interfaceName}> ${interfaceName} for Box<T> {`,
        `async fn ${methodName}(`,
        "&self,",
        `input: ${inputType},`,
        `) -> ${outputType} {`,
        `(**self).${methodName}(input).await`,
        "}",
        "}",
        "",
        `impl<T: ?Sized + ${interfaceName}> ${interfaceName} for std::sync::Arc<T> {`,
        `async fn ${methodName}(`,
        "&self,",
        `input: ${inputType},`,
        `) -> ${outputType} {`,
        `(**self).${methodName}(input).await`,
        "}",
        "}",
        "",
      );
    }
    for (const template of namespace.templates) {
      const toolEntries = Object.values(template.tools);
      if (toolEntries.length < 2) continue;
      const rawTemplateName = template.template.name.text;
      const templateName = toRustName(rawTemplateName);
      const toolInfoList = toolEntries.map((t, idx) => {
        const tool = t.tool;
        const toolName = tool.tool.name.text;
        const interfaceRef = toRustName(capitalize(toolName));
        const paramName = toRustName(toSnakeCase(toolName));
        const methodName = toRustName(toSnakeCase(toolName));
        const genericParam = `T_${interfaceRef}`;
        const toolTypeName = toRustName(capitalize(toolName));
        const toolTypePrefix = typePrefixBase.concat(toolTypeName, "::");
        const options: WriteSchemaOptions = {
          typePrefix: toolTypePrefix,
          sharedTypePrefix,
          topLevel: true,
        };
        const inputType = writeType(
          { kind: "type-name", name: { text: "Input" } },
          tool.schema,
          options,
        );
        const outputType = writeType(
          { kind: "type-name", name: { text: "Output" } },
          tool.schema,
          options,
        );
        return {
          rawToolName: toolName,
          interfaceRef,
          paramName,
          methodName,
          genericParam,
          inputType,
          outputType,
        };
      });

      const toolNamesList = toolInfoList
        .map((t) => `'${t.rawToolName}'`)
        .join(", ");
      const typeParams = toolInfoList.map((t) => t.genericParam).join(", ");
      const typeParamsWithBounds = toolInfoList
        .map((t) => `${t.genericParam}: ${t.interfaceRef}`)
        .join(", ");

      lines.push(
        `/// Composite tool executor for the '${rawTemplateName}' prompt template.`,
        `/// Requires implementations for tools: ${toolNamesList}.`,
        `pub struct ${templateName}<${typeParamsWithBounds}> {`,
        ...toolInfoList.map((t) => `pub ${t.paramName}: ${t.genericParam},`),
        "}",
        "",
      );

      for (const t of toolInfoList) {
        lines.push(
          `impl<${typeParamsWithBounds}> ${t.interfaceRef} for ${templateName}<${typeParams}> {`,
          `async fn ${t.methodName}(`,
          "&self,",
          `input: ${t.inputType},`,
          `) -> ${t.outputType} {`,
          `self.${t.paramName}.${t.methodName}(input).await`,
          "}",
          "}",
          "",
        );
      }
    }
    return lines;
  };

  const lines = [
    "/// Namespace containing tool executor traits.",
    "#[allow(non_camel_case_types)]",
    "pub mod tool_executor {",
  ];
  if (singleNamespace) {
    lines.push(...writeNamespace(singleNamespace));
  } else {
    for (const namespace of Object.values(namespaces)) {
      const namespaceName = toRustName(namespace.name);
      lines.push(`pub mod ${namespaceName} {`);
      lines.push(...writeNamespace(namespace));
      lines.push(`}  // mod ${namespaceName}`, "");
    }
  }
  lines.push("}  // mod tool_executor");
  return lines.join("\n");
}

function writeUserDefinedDatatypes(
  compilationResult: ValidCompilationResult,
): string {
  const { metaSchema, namespaces, singleNamespace } = compilationResult;
  const anyTypes = (schema: Schema): boolean =>
    Object.keys(schema.typeDeclarations).length > 0;
  const lines: string[] = [];

  const metaType = anyTypes(metaSchema)
    ? writeType(
        {
          kind: "type-name",
          name: { text: "Meta" },
        },
        metaSchema,
        {
          topLevel: true,
          typePrefix: "schema::meta::",
        },
      )
    : "()";
  lines.push(
    "/// Metadata associated with a prompt.",
    `pub type Meta = ${metaType};`,
    "",
    "/// Namespace containing the user-defined datatypes.",
    "pub mod schema {",
  );
  if (anyTypes(metaSchema)) {
    lines.push(
      "pub mod meta {",
      writeSchema(metaSchema, {
        typePrefix: "schema::meta::",
      }),
      "}  // mod meta",
      "",
    );
  }

  const writeNamespace = (namespace: ValidNamespaceResult): void => {
    const namespaceName = toRustName(namespace.name);
    const typePrefixBase = singleNamespace
      ? "schema::"
      : `schema::${namespaceName}::`;
    const sharedTypePrefix = "super::shared::";
    if (anyTypes(namespace.schema)) {
      lines.push("pub mod shared {");
      lines.push(
        writeSchema(namespace.schema, {
          typePrefix: sharedTypePrefix,
        }),
      );
      lines.push(`}  // mod shared`, "");
    }
    for (const template of namespace.templates) {
      const templateName = toRustName(template.template.name.text);
      const typePrefix = typePrefixBase.concat(templateName, "::");
      lines.push(`pub mod ${templateName} {`);
      lines.push(
        writeSchema(template.schema, {
          typePrefix,
          sharedTypePrefix,
        }),
      );
      lines.push(`}  // mod ${templateName}`, "");
    }
    for (const tool of Object.values(namespace.tools)) {
      const toolName = toRustName(capitalize(tool.tool.name.text));
      const typePrefix = typePrefixBase.concat(toolName, "::");
      lines.push(`pub mod ${toolName} {\n`);
      lines.push(
        writeSchema(tool.schema, {
          typePrefix,
          sharedTypePrefix,
        }),
      );
      lines.push(`}  // mod ${toolName}`, "");
    }
  };

  if (singleNamespace) {
    writeNamespace(singleNamespace);
  } else {
    for (const namespace of Object.values(namespaces)) {
      const namespaceName = toRustName(namespace.name);
      lines.push(`pub mod ${namespaceName} {`);
      writeNamespace(namespace);
      lines.push(`}  // mod ${namespaceName}`, "");
    }
  }
  lines.push("}  // mod schema\n");
  return lines.join("\n");
}

function writeSpecDatatypes(): string {
  const options = {
    typePrefix: "spec::",
    file: true,
  } as const;
  const lines = [
    "mod spec {",
    writeSchema(runtimeTypesSchema, options),
    "}  // mod spec",
  ];
  return lines.join("\n");
}

function writeTemplatesData(compilationResult: ValidCompilationResult): string {
  const templatesData = makeTemplates(compilationResult, {
    includeJsonSchemas: true,
  });
  const stringifiedJson = JSON.stringify(JSON.stringify(templatesData));
  const lines = [
    `static TEMPLATES_DATA: std::sync::LazyLock<spec::Templates> = std::sync::LazyLock::new(|| {`,
    `serde_json::from_str(`,
    `${stringifiedJson},`,
    `).unwrap()`,
    `});`,
  ];
  return lines.join("\n");
}

function getToolInfo(
  tool: ValidatedTool,
  compilationResult: ValidCompilationResult,
): {
  readonly traitName: string;
  readonly methodName: string;
  readonly inputType: string;
  readonly outputType: string;
} {
  const { singleNamespace } = compilationResult;
  const toolName = tool.tool.name.text;
  const toolNamespace = tool.tool.namespace?.text ?? DEFAULT_NAMESPACE;
  const namespaceName = toRustName(toolNamespace);

  const traitName = singleNamespace
    ? `tool_executor::${toRustName(capitalize(toolName))}`
    : `tool_executor::${namespaceName}::${toRustName(capitalize(toolName))}`;

  const typePrefixBase = singleNamespace
    ? "schema::"
    : `schema::${namespaceName}::`;
  const sharedTypePrefix = typePrefixBase.concat("shared::");
  const toolTypeName = toRustName(capitalize(toolName));
  const toolTypePrefix = typePrefixBase.concat(toolTypeName, "::");
  const options: WriteSchemaOptions = {
    typePrefix: toolTypePrefix,
    sharedTypePrefix,
    topLevel: true,
  };

  const inputType = writeType(
    { kind: "type-name", name: { text: "Input" } },
    tool.schema,
    options,
  );
  const outputType = writeType(
    { kind: "type-name", name: { text: "Output" } },
    tool.schema,
    options,
  );

  const methodName = toRustName(toSnakeCase(toolName));

  return {
    traitName,
    methodName,
    inputType,
    outputType,
  };
}

function writeExecuteToolCall(
  compilationResult: ValidCompilationResult,
): string {
  const { templates, singleNamespace } = compilationResult;
  const anyTools = Object.values(templates).some(
    (t) => Object.keys(t.tools).length > 0,
  );
  if (!anyTools) return "";

  const sections: string[] = [];

  for (const template of Object.values(templates)) {
    const templateTools = Object.values(template.tools).map((t) => t.tool);
    if (templateTools.length <= 0) continue;

    const rawTemplateName = template.template.name.text;
    const namespace = template.template.namespace?.text ?? DEFAULT_NAMESPACE;
    const functionName = singleNamespace
      ? toRustName(`execute_${toSnakeCase(rawTemplateName)}_tool_call`)
      : toRustName(
          `execute_${toSnakeCase(namespace)}__${toSnakeCase(rawTemplateName)}_tool_call`,
        );

    const uniqueTraits = Array.from(
      new Set(
        templateTools.map((t) => getToolInfo(t, compilationResult).traitName),
      ),
    );
    const traitBounds = `?Sized + ${uniqueTraits.join(" + ")}`;

    const lines = [
      `async fn ${functionName}<E: ${traitBounds}>(`,
      "tool_call: &ToolCall,",
      "executor: &E,",
      ") -> Result<ToolCallResponse, Box<dyn std::error::Error + Send + Sync>> {",
      "match tool_call.tool_name.as_str() {",
    ];

    for (const tool of templateTools) {
      const toolName = tool.tool.name.text;
      const { methodName, inputType } = getToolInfo(tool, compilationResult);

      lines.push(
        `"${toolName}" => {`,
        `let input: ${inputType} = serde_json::from_str(&tool_call.stringified_input).map_err(|e| {`,
        'let call_info = format!(r#"{{"callId": "{}", "toolName": "{}"}}"#, tool_call.call_id, tool_call.tool_name);',
        'format!("Tool call failed: {} — {}", call_info, e)',
        "})?;",
        `let raw_output = executor.${methodName}(input).await;`,
        "let stringified_output = serde_json::to_string(&raw_output).map_err(|e| {",
        'let call_info = format!(r#"{{"callId": "{}", "toolName": "{}"}}"#, tool_call.call_id, tool_call.tool_name);',
        'format!("Tool call failed: {} — {}", call_info, e)',
        "})?;",
        "Ok(ToolCallResponse {",
        "call_id: tool_call.call_id.clone(),",
        "stringified_output,",
        "})",
        "}",
      );
    }

    lines.push(
      '_ => Err(format!("Tool not found: {}", tool_call.tool_name).into()),',
      "}",
      "}",
    );

    sections.push(lines.join("\n"));
  }

  return sections.join("\n\n");
}

type WriteSchemaOptions = {
  readonly topLevel?: true;
  readonly typePrefix: string;
  readonly sharedTypePrefix?: string;
  readonly file?: true;
};

function writeSchema(schema: Schema, options: WriteSchemaOptions): string {
  const { typePrefix } = options;
  const lines: string[] = [];
  for (const [type, namingHint] of schema.namingHints.defaultScope.entries()) {
    const name = makeNameFromHint(namingHint);
    if (!options.file) {
      lines.push(`// Exported as '${typePrefix}${name}'`);
    }
    lines.push(...wrapRustDoc(namingHint.doc));
    switch (type.kind) {
      case "interface": {
        lines.push(writeTypepromptInterface(type, name, schema, options));
        break;
      }
      case "union": {
        lines.push(writeTypepromptUnion(type, name, schema, options));
        break;
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}

function writeTypepromptInterface(
  type: Interface,
  typeName: string,
  schema: Schema,
  options: WriteSchemaOptions,
): string {
  const fields = Object.values(type.fields);
  const lines: string[] = [];
  const hasLiteralField = fields.some((f) => isLiteralType(f.type));

  const vis = options.file ? "pub(super) " : "pub ";
  const derives = hasLiteralField
    ? "serde::Deserialize, Debug, PartialEq"
    : "serde::Serialize, serde::Deserialize, Debug, PartialEq";
  lines.push(`#[derive(${derives})]`);
  lines.push(`${vis}struct ${typeName} {`);
  for (const field of fields) {
    const { type } = field;
    if (isLiteralType(type)) continue;
    const name = field.name.text;
    const rustName = toRustName(toSnakeCase(name));
    const fieldType = writeType(type, schema, options);
    lines.push(...wrapRustDoc(field.doc));
    if (name !== rustName && !hasLiteralField) {
      lines.push(`#[serde(rename = "${name}")]`);
    }
    lines.push(`${vis}${rustName}: ${fieldType},`);
  }
  lines.push("}"); // struct

  if (hasLiteralField) {
    lines.push(
      "",
      `impl serde::Serialize for ${typeName} {`,
      "fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error> where S: serde::Serializer {",
      `let mut state = serde::Serializer::serialize_struct(serializer, "${typeName}", ${fields.length})?;`,
    );
    for (const field of fields) {
      const { type } = field;
      const name = field.name.text;
      if (isLiteralType(type)) {
        lines.push(
          `serde::ser::SerializeStruct::serialize_field(&mut state, "${name}", &${JSON.stringify(type.value)})?;`,
        );
      } else {
        const rustName = toRustName(toSnakeCase(name));
        lines.push(
          `serde::ser::SerializeStruct::serialize_field(&mut state, "${name}", &self.${rustName})?;`,
        );
      }
    }
    lines.push("serde::ser::SerializeStruct::end(state)");
    lines.push("}"); // fn serialize
    lines.push("}"); // impl serde::Serialize
  }

  return lines.join("\n");
}

function writeTypepromptUnion(
  type: Union,
  typeName: string,
  schema: Schema,
  options: WriteSchemaOptions,
): string {
  const members = schema.unionToMembers.get(type)!;
  const lines: string[] = [];
  const vis = options.file ? "pub(super) " : "pub ";
  switch (members.kind) {
    case "strings": {
      lines.push(
        "#[derive(serde::Serialize, serde::Deserialize, Debug, PartialEq)]",
      );
      lines.push(`${vis}enum ${typeName} {\n`);
      for (const member of members.members) {
        const rustName = toRustName(toPascalCase(member.value));
        lines.push(`#[serde(rename = "${member.value}")]`);
        lines.push(rustName.concat(","));
      }
      lines.push("}"); // enum
      break;
    }
    case "interfaces": {
      lines.push("#[derive(Debug, PartialEq)]");
      lines.push(`${vis}enum ${typeName} {\n`);
      const { discriminator } = members;
      const caseEntries = Object.values(members.members).map(
        (
          member,
        ): {
          readonly quotedDiscriminant: string;
          readonly caseName: string;
          readonly type: string;
        } => {
          const { discriminant, isRecursive } = member;
          const caseName = toRustName(
            ((): string => {
              switch (discriminant.kind) {
                case "string-literal": {
                  return capitalize(discriminator).concat(
                    toPascalCase(discriminant.value),
                  );
                }
                case "boolean-literal":
                  return discriminant.value === true
                    ? capitalize(discriminator)
                    : "Not".concat(capitalize(discriminator));
              }
            })(),
          );
          let type = writeType(member.resolved, schema, options);
          if (isRecursive) {
            type = `Box<${type}>`;
          }
          const quotedDiscriminant = JSON.stringify(discriminant.value);
          return { quotedDiscriminant, caseName, type };
        },
      );
      for (const { caseName, type } of caseEntries) {
        lines.push(`${caseName}(${type}),`);
      }
      lines.push("}"); // enum

      lines.push(
        "",
        `impl serde::Serialize for ${typeName} {`,
        "fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error> where S : serde::Serializer {",
        "match self {",
      );
      for (const { caseName } of caseEntries) {
        lines.push(
          `${typeName}::${caseName}(v) => serde::Serialize::serialize(v, serializer),`,
        );
      }
      lines.push(
        "}", // match
        "}", // fn serialize
        "}", // impl serde::Serialize
      );

      const valueGetter =
        members.discriminants.type === "boolean" ? "as_bool" : "as_str";
      lines.push(
        "",
        `impl<'de> serde::Deserialize<'de> for ${typeName} {`,
        "fn deserialize<D>(deserializer: D) -> Result<Self, D::Error> where D : serde::Deserializer<'de> {",
        "let value = serde_json::Value::deserialize(deserializer)?;",
        `let discriminant = value.get("${discriminator}")`,
        `.and_then(serde_json::Value::${valueGetter})`,
        `.ok_or_else(|| serde::de::Error::missing_field("${discriminator}"))?;`,
        "match discriminant {",
      );
      for (const { caseName, quotedDiscriminant, type } of caseEntries) {
        lines.push(`${quotedDiscriminant} => {`);
        lines.push(
          `let v = <${type}>::deserialize(value).map_err(serde::de::Error::custom)?;`,
        );
        lines.push(`Ok(${typeName}::${caseName}(v))`);
        lines.push("}");
      }
      if (members.discriminants.type === "string") {
        const discriminants = caseEntries
          .map((e) => e.quotedDiscriminant)
          .join(", ");
        lines.push(
          `other => Err(serde::de::Error::unknown_variant(other, &[${discriminants}])),`,
        );
      }
      lines.push(
        "}", // match
        "}", // fn deserialize
        "}", // impl serde::Deserialize
      );
      const nonLiteralCommonFields = members.commonFields.filter(
        (f) => !isLiteralType(f.type),
      );

      if (nonLiteralCommonFields.length > 0) {
        lines.push("", `impl ${typeName} {`);
        for (const member of nonLiteralCommonFields) {
          const rustName = toRustName(toSnakeCase(member.name));
          const type = writeType(member.type, schema, options);
          if (member.doc) {
            lines.push(...wrapRustDoc(member.doc));
          }
          lines.push(`${vis}fn ${rustName}(&self) -> &${type} {`);
          lines.push("match self {");
          for (const { caseName } of caseEntries) {
            lines.push(`${typeName}::${caseName}(v) => &v.${rustName},`);
          }
          lines.push(
            "}", // match
            "}", // fn
          );
        }
        lines.push("}"); // impl
      }
    }
  }
  return lines.join("\n");
}

function writeType(
  type: FieldType | TypeNameView,
  schema: Schema,
  options: WriteSchemaOptions,
): string {
  switch (type.kind) {
    case "any": {
      return "serde_json::Value";
    }
    case "array": {
      const { elementType } = type;
      const writtenElement = writeType(elementType, schema, options);
      return `Vec<${writtenElement}>`;
    }
    case "boolean-literal": {
      return "bool";
    }
    case "interface":
    case "union": {
      const { sharedTypePrefix, topLevel, typePrefix } = options;
      let namingHint = schema.namingHints.defaultScope.get(type);
      if (namingHint) {
        if (topLevel) {
          return typePrefix.concat(makeNameFromHint(namingHint));
        } else {
          return makeNameFromHint(namingHint!);
        }
      } else {
        namingHint = schema.namingHints.shared.get(type);
        if (topLevel) {
          return sharedTypePrefix!.concat(makeNameFromHint(namingHint!));
        } else {
          return "super::shared::".concat(makeNameFromHint(namingHint!));
        }
      }
    }
    case "optional": {
      const writtenInner = writeType(type.innerType, schema, options);
      return `Option<${writtenInner}>`;
    }
    case "primitive": {
      if (type.primitive.text === "integer") {
        return "i32";
      } else {
        switch (type.primitive.text) {
          case "boolean":
            return "bool";
          case "string":
            return "String";
          case "number":
            return "f64";
          default:
            throw new Error(type.primitive.text satisfies never);
        }
      }
    }
    case "record": {
      return `std::collections::HashMap<String, ${writeType(type.valueType, schema, options)}>`;
    }
    case "shared-type-name":
    case "type-name": {
      const resolvedType = resolveType(type, schema);
      return writeType(resolvedType, schema, options);
    }
    case "string-literal": {
      return "String";
    }
  }
}

function makeNameFromHint(hint: NamingHint): string {
  const { namePieces } = hint;
  return namePieces
    .map((piece) => {
      switch (piece.kind) {
        case "type":
          return namePieces.length <= 1 ? toRustName(piece.name) : piece.name;
        case "field":
          return capitalize(piece.name);
        case "member": {
          switch (piece.discriminant.type) {
            case "string":
              return capitalize(piece.discriminator).concat(
                toPascalCase(piece.discriminant.value),
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

function toRustName(name: string): string {
  return RESERVED_NAMES.has(name) || RUST_HARD_KEYWORDS.has(name)
    ? name.concat("_")
    : name;
}

function wrapRustDoc(doc: string): readonly string[] {
  if (!doc) return [];
  const lines = doc.split("\n");
  return lines.map((l) => `/// ${l}`);
}

function reformat(code: string): string {
  const inputLines: readonly string[] = code.split("\n");
  const outputLines: string[] = [];
  let indent = "";
  let continuationIndent = "";
  for (const inputLine of inputLines) {
    const line = inputLine.trim();
    if (
      line.startsWith("}") ||
      line.startsWith(")") ||
      line.startsWith("]") ||
      line.startsWith(">")
    ) {
      indent = indent.slice(0, -2);
    }
    const starPrefix = line.startsWith("*") ? " " : "";
    outputLines.push(
      line.length <= 0
        ? line
        : [indent, continuationIndent, starPrefix, line].join(""),
    );
    if (
      line.endsWith("{") ||
      line.endsWith("(") ||
      line.endsWith("[") ||
      line.endsWith("<")
    ) {
      indent = indent + "  ";
    } else if (line.endsWith(":")) {
      continuationIndent = "  ";
    } else if (!line.endsWith(",")) {
      continuationIndent = "";
    }
  }
  return outputLines.join("\n");
}

function coalesceEmptyLines(code: string): string {
  return (
    code
      // Remove spaces enclosed within curly brackets if that's all there is.
      .replace(/\{\s+\}/g, "{}")
      // Remove spaces enclosed within round brackets if that's all there is.
      .replace(/\(\s+\)/g, "()")
      // Remove spaces enclosed within square brackets if that's all there is.
      .replace(/\[\s+\]/g, "[]")
      // Remove empty line following an open curly bracket.
      .replace(/(\{\n *)\n/g, "$1")
      // Remove empty line preceding a closed curly bracket.
      .replace(/\n(\n *\})/g, "$1")
      // Coalesce consecutive empty lines.
      .replace(/\n\n\n+/g, "\n\n")
      .replace(/\n\n$/g, "\n")
  );
}

const RESERVED_NAMES: ReadonlySet<string> = new Set([
  "Box",
  "Debug",
  "Option",
  "PartialEq",
  "Result",
  "String",
  "ToolExecutor",
  "Vec",
  "derive",
  "serde",
  "serde_json",
  "tool_executor",
] as const);

const RUST_HARD_KEYWORDS: ReadonlySet<string> = new Set([
  "Self",
  // Strict keywords
  "as",
  "break",
  "const",
  "continue",
  "crate",
  "else",
  "enum",
  "extern",
  "false",
  "fn",
  "for",
  "if",
  "impl",
  "in",
  "let",
  "loop",
  "match",
  "mod",
  "move",
  "mut",
  "pub",
  "ref",
  "return",
  "self",
  "static",
  "struct",
  "super",
  "trait",
  "true",
  "type",
  "unsafe",
  "use",
  "where",
  "while",
  // Reserved keywords (not yet used but reserved)
  "abstract",
  "become",
  "box",
  "do",
  "final",
  "macro",
  "override",
  "priv",
  "typeof",
  "unsized",
  "virtual",
  "yield",
  // 2018+ keywords
  "async",
  "await",
  "dyn",
  "try",
]);
