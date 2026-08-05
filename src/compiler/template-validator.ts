import { resolveExpressionType } from "../expression/expression-type-resolver.js";
import { resolveIfExpression } from "../expression/if-expression-resolver.js";
import { resolveSwitchExpression } from "../expression/switch-expression-resolver.js";
import { StrictJsonValue } from "../json/json-types.js";
import { validateJson } from "../json/json-validator.js";
import {
  HasName,
  Schema,
  SchemaValidationContext,
  SyntheticArray,
  SyntheticInterface,
  Type,
} from "../schema/schema-types.js";
import { validateSchema } from "../schema/schema-validator.js";
import { resolveSyntheticType, resolveType } from "../schema/type-resolver.js";
import { InternalError, InternalErrors, Span } from "../util/shared-types.js";
import { validateBody } from "./body-validator.js";
import {
  Snippet,
  Template,
  TemplateContent,
  TemplateTool,
  TemplateValidationResult,
  ToolValidationResult,
} from "./compiler-types.js";

export function validateTemplate(args: {
  readonly template: Template;
  readonly metaSchema: Schema;
  readonly namespaceSchema: Schema;
  readonly namespaceTools: { readonly [name: string]: ToolValidationResult };
}): TemplateValidationResult {
  validateTools;
  const { template, metaSchema, namespaceSchema } = args;

  const errors: InternalError[] = [];

  errors.push(...validateMeta(metaSchema, template));

  const validationContext: SchemaValidationContext = {
    kind: "template",
    namespaceSchema,
  };
  const templateSchema = validateSchema(
    template.schema.typeDeclarations,
    validationContext,
  );
  if (templateSchema.kind === "error") {
    errors.push(...templateSchema.errors);
    return {
      kind: "error",
      errors,
    };
  }

  errors.push(...validateVariants(template, templateSchema));

  if (template.contents.kind === "no-variants") {
    errors.push(
      ...validateTemplateContent(template.contents.content, templateSchema, {
        isVariantSpecialization: false,
      }),
    );
  } else {
    errors.push(
      ...validateTemplateContent(
        template.contents.defaultContent,
        templateSchema,
        { isVariantSpecialization: false },
      ),
    );
    for (const variant of template.contents.variants) {
      errors.push(
        ...validateTemplateContent(variant.content, templateSchema, {
          isVariantSpecialization: true,
        }),
      );
    }
  }

  for (const snippet of template.snippets) {
    errors.push(...validateSnippet(snippet, templateSchema));
  }

  const tools = validateTools(template.tools, args.namespaceTools);
  if (tools.kind === "error") {
    errors.push(...tools.errors);
  }

  if (errors.length > 0) {
    return {
      kind: "error",
      errors,
    };
  }

  return {
    kind: "success",
    template,
    schema: templateSchema,
    tools: tools.kind === "success" ? tools.tools : {},
  };
}

function validateMeta(
  metaSchema: Schema,
  template: Template,
): readonly InternalError[] {
  const errors: InternalError[] = [];

  const { contents } = template;
  const metaType = metaSchema.typeDeclarations["Meta"];

  const pushMissingMetaError = (tag: Span): void => {
    errors.push({
      span: tag,
      message: "Missing <meta> element",
    });
  };
  const pushExtraneousMetaError = (tag: Span): void => {
    errors.push({
      span: tag,
      message: "Extraneous <meta> element",
      hint: "Remove this <meta> element or add a <meta> element at the top level",
    });
  };

  switch (contents.kind) {
    case "no-variants": {
      const { meta } = contents.content;
      if (metaType) {
        if (meta) {
          errors.push(...validateJson(meta.value, metaSchema, metaType));
        } else {
          pushMissingMetaError(template.tag);
        }
      } else if (meta) {
        pushExtraneousMetaError(template.tag);
      }
      break;
    }
    case "variants": {
      const { defaultContent } = contents;
      const { variants } = contents;
      if (metaType) {
        if (defaultContent.meta) {
          errors.push(
            ...validateJson(defaultContent.meta.value, metaSchema, metaType),
          );
        } else if (variants.every((v) => !v.content.meta)) {
          pushMissingMetaError(template.tag);
        } else {
          for (const variant of variants) {
            const { content } = variant;
            if (content.meta) {
              errors.push(
                ...validateJson(content.meta.value, metaSchema, metaType),
              );
            } else {
              pushMissingMetaError(variant.tag);
            }
          }
        }
      } else if (defaultContent.meta) {
        pushExtraneousMetaError(template.tag);
      } else {
        for (const variant of variants) {
          const { content } = variant;
          if (content.meta) {
            pushExtraneousMetaError(variant.tag);
          }
        }
      }
    }
  }

  return errors;
}

function validateVariants(
  template: Template,
  templateSchema: Schema,
): readonly InternalError[] {
  if (template.contents.kind !== "variants") {
    return [];
  }
  const outputTypeDeclaration = templateSchema.typeDeclarations["Output"]!;
  const outputType = resolveType(outputTypeDeclaration, templateSchema);
  if (outputType.kind !== "interface") {
    return [
      {
        span: outputTypeDeclaration.name,
        message: "'Output' must be an interface when using <variant> elements",
      },
    ];
  }
  const variantField = outputType.fields["variant"];
  if (!variantField) {
    return [
      {
        span: outputTypeDeclaration.name,
        message:
          "'Output' must have a 'variant' field when using <variant> elements",
      },
    ];
  }
  const makeVariantFieldTypeError = (): readonly InternalError[] => [
    {
      span: variantField.name,
      message: "Type of 'variant' field must be a union of string literals",
    },
  ];
  if (variantField.optional) {
    return makeVariantFieldTypeError();
  }
  let variantFieldType = resolveType(variantField.type, templateSchema);
  if (variantFieldType.kind === "string-literal") {
    variantFieldType = {
      kind: "union",
      members: [variantFieldType],
    };
  }
  if (variantFieldType.kind !== "union") {
    return makeVariantFieldTypeError();
  }
  const unionMembers = templateSchema.unionToMembers.get(variantFieldType)!;
  if (unionMembers.kind !== "strings") {
    return makeVariantFieldTypeError();
  }
  const errors: InternalError[] = [];
  const variants = new Set(template.contents.variants.map((v) => v.case.text));
  for (const member of unionMembers.members) {
    if (variants.has(member.value)) continue;
    errors.push({
      span: member.quotedName,
      message: `Missing <variant case='${member.value}'> in the template`,
    });
  }
  for (const variant of template.contents.variants) {
    const variantName = variant.case.text;
    if (unionMembers.values.has(variantName)) continue;
    errors.push({
      span: variant.case,
      message: `'Output.variant' can never be '${variantName}'`,
    });
  }
  return errors;
}

function validateTemplateContent(
  content: Partial<TemplateContent>,
  templateSchema: Schema,
  options: {
    readonly isVariantSpecialization: boolean;
  },
): readonly InternalError[] {
  const errors: InternalError[] = [];
  for (const body of [content.system, content.user]) {
    if (!body) continue;
    errors.push(...validateBody(body, templateSchema, null));
  }

  const examplesInterface = makeExamplesType(templateSchema, options);
  if (content.examples) {
    const exampleErrors = validateJson(
      content.examples,
      templateSchema,
      examplesInterface,
    );
    errors.push(...exampleErrors);
    if (exampleErrors.length <= 0 && options.isVariantSpecialization) {
      errors.push(...verifyVariantFieldNotSet(content.examples));
    }
  }

  return errors;
}

function makeExamplesType(
  templateSchema: Schema,
  options: {
    readonly isVariantSpecialization: boolean;
  },
): SyntheticArray & HasName {
  const { typeDeclarations } = templateSchema;

  const inputType = typeDeclarations["Input"]!.valueType;

  let outputType: Type | SyntheticInterface =
    typeDeclarations["Output"]!.valueType;
  if (options.isVariantSpecialization) {
    const resolvedOutputType = resolveSyntheticType(outputType!, templateSchema);
    if (
      resolvedOutputType.kind === "interface" &&
      resolvedOutputType.fields["variant"]
    ) {
      outputType = {
        kind: "interface",
        fields: Object.fromEntries(
          Object.entries(resolvedOutputType.fields).map(([name, field]) =>
            name === "variant"
              ? [name, { ...field, optional: true }]
              : [name, field],
          ),
        ),
      };
    }
  }

  const exampleType: SyntheticInterface & HasName = {
    kind: "interface",
    name: {
      text: "Example",
    },
    fields: {
      input: {
        name: {
          text: "input",
        },
        optional: false,
        type: inputType,
        doc: "",
      },
      output: {
        name: {
          text: "output",
        },
        optional: false,
        type: outputType,
        doc: "",
      },
    },
  };

  return {
    kind: "array",
    name: {
      text: "Example[]",
    },
    elementType: exampleType,
  };
}

function verifyVariantFieldNotSet(
  examples: StrictJsonValue,
): readonly InternalError[] {
  const errors: InternalError[] = [];
  if (examples.kind !== "array") {
    throw new Error();
  }
  for (const example of examples.elements) {
    if (example.kind !== "object") {
      throw new Error();
    }
    for (const entry of example.entries) {
      if (entry.key.value === "variant") {
        errors.push({
          span: entry.key.firstToken,
          message:
            "Examples must not specify 'variant' when within a <variant> element",
        });
      }
    }
  }
  return errors;
}

function validateSnippet(
  snippet: Snippet,
  templateSchema: Schema,
): readonly InternalError[] {
  const errors: InternalError[] = [];
  switch (snippet.kind) {
    case "snippet": {
      errors.push(...validateBody(snippet.body, templateSchema, null));
      break;
    }
    case "snippet-if": {
      const expressionType = resolveExpressionType(
        snippet.expression,
        templateSchema,
        null,
      );
      if (expressionType.kind === "error") {
        errors.push(...expressionType.errors);
        break;
      }
      const ifContext = resolveIfExpression(
        snippet.expression,
        expressionType,
        snippet.is,
      );
      if (ifContext.kind === "error") {
        errors.push(...ifContext.errors);
        break;
      }
      errors.push(
        ...validateBody(snippet.then, templateSchema, ifContext.then),
      );
      errors.push(
        ...validateBody(snippet.else, templateSchema, ifContext.else),
      );
      break;
    }
    case "snippet-switch": {
      const expressionType = resolveExpressionType(
        snippet.expression,
        templateSchema,
        null,
      );
      if (expressionType.kind === "error") {
        errors.push(...expressionType.errors);
        break;
      }
      const switchContext = resolveSwitchExpression(
        snippet.expression,
        expressionType,
        templateSchema,
      );
      if (switchContext.kind === "error") {
        errors.push(...switchContext.errors);
        break;
      }
      const handledCases = new Set(snippet.branches.map((b) => b.case.text));
      const missingCases = Object.keys(switchContext.cases).filter(
        (c) => !handledCases.has(c),
      );
      for (const branch of snippet.branches) {
        const context = switchContext.cases[branch.case.text];
        if (!context) {
          errors.push({
            span: branch.case,
            message: `Expression can never be '${branch.case.text}'`,
            suggestions: missingCases,
          });
          continue;
        }
        errors.push(...validateBody(branch.body, templateSchema, context));
      }
      if (missingCases.length > 0) {
        const missingTags = missingCases
          .map((c) => `<on case='${c}'>`)
          .join(", ");
        errors.push({
          span: snippet.switchTag,
          message: `Missing ${missingTags}`,
        });
      }
      break;
    }
  }

  return errors;
}

function validateTools(
  toolsValue: StrictJsonValue | null,
  namespaceTools: { readonly [name: string]: ToolValidationResult },
):
  | InternalErrors
  | {
      kind: "success";
      tools: { readonly [name: string]: TemplateTool };
    } {
  if (toolsValue === null) {
    return {
      kind: "success",
      tools: {},
    } as const;
  }
  const toolsType = makeToolsType(namespaceTools);
  const validationErrors = validateJson(
    toolsValue,
    {
      typeDeclarations: {},
      sharedDeclarations: {},
      unionToMembers: new Map(),
    },
    toolsType,
  );
  if (validationErrors.length > 0) {
    return {
      kind: "error",
      errors: validationErrors,
    };
  }
  if (toolsValue.kind !== "array") throw new Error();

  const tools: {[name: string]: TemplateTool} = {};
  for (const e of toolsValue.elements) {
    if (e.kind !== "object") throw new Error();
    const toolEntry = e.entries.find((e) => e.key.value === "tool")!;
    if (toolEntry?.value.kind !== "string") throw new Error();
    const nameValue = toolEntry.value;
    const name = nameValue.value;
    const tool = { tool: namespaceTools[name]! };
    if ((tools[name] ??= tool) != tool) {
      return {
        kind: "error",
        errors: [
          {
            span: nameValue.firstToken,
            message: `Duplicate tool '${name}'`,
          },
        ],
      };
    }
  }

  return { kind: "success", tools };
}

function makeToolsType(namespaceTools: {
  readonly [name: string]: ToolValidationResult;
}): SyntheticArray & HasName {
  const toolNames = new Set(Object.keys(namespaceTools));
  return {
    kind: "array",
    name: {
      text: "Tool[]",
    },
    elementType: {
      kind: "interface",
      fields: {
        tool: {
          name: {
            text: "tool",
          },
          optional: false,
          type: {
            kind: "synthetic-union",
            members: {
              kind: "strings",
              values: toolNames,
            },
          },
          doc: "",
        },
      },
    },
  };
}
