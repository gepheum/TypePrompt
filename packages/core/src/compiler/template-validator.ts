import { resolveExpressionType } from "../expression/expression-type-resolver.js";
import { resolveIfExpression } from "../expression/if-expression-resolver.js";
import { resolveSwitchExpression } from "../expression/switch-expression-resolver.js";
import {
  JsonString,
  StrictJsonArray,
  StrictJsonObject,
  StrictJsonValue,
} from "../json/json-types.js";
import { validateJson } from "../json/json-validator.js";
import {
  HasName,
  Schema,
  SchemaValidationContext,
  SyntheticArray,
  SyntheticField,
  SyntheticInterface,
  Type,
} from "../schema/schema-types.js";
import { isLiteralType } from "../schema/schema-utils.js";
import { validateSchema } from "../schema/schema-validator.js";
import { resolveType } from "../schema/type-resolver.js";
import type {
  InternalError,
  InternalErrors,
  Span,
  ValidationResult,
} from "../util/shared-types.js";
import { ValidationResultBuilder } from "../util/validation-result-builder.js";
import { validateTemplateBody } from "./body-validator.js";
import type {
  SchemaOrError,
  Snippet,
  Template,
  TemplateContent,
  TemplateTool,
  TemplateValidationResult,
  ToolValidationResult,
} from "./compiler-types.js";

export function validateTemplate(args: {
  readonly template: Template;
  readonly metaSchema: SchemaOrError;
  readonly namespaceSchema: Schema;
  readonly namespaceTools: { readonly [name: string]: ToolValidationResult };
}): TemplateValidationResult {
  const { template, metaSchema, namespaceSchema } = args;

  const validationResult = new ValidationResultBuilder();
  const { errors } = validationResult;

  if (metaSchema.kind === "success") {
    validationResult.push(validateMeta(metaSchema, template));
  }

  const validationContext: SchemaValidationContext = {
    kind: "template",
    namespaceSchema,
  };
  const templateSchema = validateSchema(template.schema, validationContext);
  validationResult.definitionLinks.push(...templateSchema.definitionLinks);
  if (templateSchema.kind === "error") {
    errors.push(...templateSchema.errors);
    return validationResult.asErrors();
  }

  errors.push(...validateVariants(template, templateSchema));

  const tools = validateTools(template.tools, args.namespaceTools);
  if (tools.kind === "error") {
    errors.push(...tools.errors);
  }

  const topLevelOptions: Options = {
    isVariantSpecialization: false,
    namespaceTools: args.namespaceTools,
    templateTools: tools.kind === "success" ? tools.tools : {},
  };
  if (template.contents.kind === "no-variants") {
    validationResult.push(
      validateTemplateContent(
        template.contents.content,
        templateSchema,
        topLevelOptions,
      ),
    );
  } else {
    validationResult.push(
      validateTemplateContent(
        template.contents.defaultContent,
        templateSchema,
        topLevelOptions,
      ),
    );
    for (const variant of template.contents.variants) {
      validationResult.push(
        validateTemplateContent(variant.content, templateSchema, {
          ...topLevelOptions,
          isVariantSpecialization: true,
        }),
      );
    }
  }

  for (const snippet of template.snippets) {
    validationResult.push(
      validateSnippet(snippet, templateSchema, topLevelOptions),
    );
  }

  if (errors.length <= 0) {
    return {
      kind: "template",
      template,
      schema: templateSchema,
      tools: tools.kind === "success" ? tools.tools : {},
      definitionLinks: validationResult.definitionLinks,
    };
  } else {
    return validationResult.asErrors();
  }
}

function validateMeta(
  metaSchema: Schema,
  template: Template,
): ValidationResult {
  const validationResult = new ValidationResultBuilder();
  const { errors } = validationResult;

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
          validationResult.push(validateJson(meta.value, metaType, metaSchema));
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
          validationResult.push(
            validateJson(defaultContent.meta.value, metaType, metaSchema),
          );
        } else if (variants.every((v) => !v.content.meta)) {
          pushMissingMetaError(template.tag);
        } else {
          for (const variant of variants) {
            const { content } = variant;
            if (content.meta) {
              validationResult.push(
                validateJson(content.meta.value, metaType, metaSchema),
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

  return validationResult;
}

function validateVariants(
  template: Template,
  templateSchema: Schema,
): readonly InternalError[] {
  if (template.contents.kind !== "variants") {
    return [];
  }
  const inputTypeDeclaration = templateSchema.typeDeclarations["Input"]!;
  const inputType = resolveType(inputTypeDeclaration.valueType, templateSchema);
  if (inputType.kind !== "interface") {
    return [
      {
        span: inputTypeDeclaration.name,
        message: "'Input' must be an interface when using <variant> elements",
      },
    ];
  }
  const variantField = inputType.fields["variant"];
  if (!variantField) {
    return [
      {
        span: inputTypeDeclaration.name,
        message:
          "'Input' must have a 'variant' field when using <variant> elements",
      },
    ];
  }
  const makeVariantFieldTypeError = (): readonly InternalError[] => [
    {
      span: variantField.name,
      message: "Type of 'variant' field must be a union of string literals",
    },
  ];
  const variantFieldType = resolveType(variantField.type, templateSchema);
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
      message: `'Input.variant' can never be '${variantName}'`,
    });
  }
  return errors;
}

function validateTemplateContent(
  content: Partial<TemplateContent>,
  templateSchema: Schema,
  options: Options,
): ValidationResult {
  const validationResult = new ValidationResultBuilder();
  const { errors } = validationResult;
  for (const body of [content.system, content.user]) {
    if (!body) continue;
    validationResult.push(
      validateTemplateBody(body, templateSchema, options.templateTools, null),
    );
  }

  const examplesInterface = makeExamplesType(templateSchema, options);
  if (content.examples) {
    const jsonResult = validateJson(
      content.examples,
      examplesInterface,
      templateSchema,
    );
    validationResult.push(jsonResult);
    if (jsonResult.errors.length <= 0) {
      if (options.isVariantSpecialization) {
        errors.push(...verifyVariantFieldNotSet(content.examples));
      }
      validationResult.push(
        validateToolCallExamples(content.examples, options.namespaceTools),
      );
    }
  }

  return validationResult;
}

function makeExamplesType(
  templateSchema: Schema,
  options: {
    readonly isVariantSpecialization: boolean;
    readonly namespaceTools: { readonly [name: string]: ToolValidationResult };
  },
): SyntheticArray & HasName {
  const { typeDeclarations } = templateSchema;

  let inputType: Type | SyntheticInterface =
    typeDeclarations["Input"]!.valueType;
  const outputType = typeDeclarations["Output"]!.valueType;

  if (options.isVariantSpecialization) {
    const resolvedInputType = resolveType(inputType, templateSchema);
    if (
      resolvedInputType.kind === "interface" &&
      resolvedInputType.fields["variant"]
    ) {
      inputType = {
        kind: "interface",
        fields: Object.fromEntries(
          Object.entries(resolvedInputType.fields).map(([name, field]) => {
            if (name !== "variant" || isLiteralType(field.type)) {
              return [name, field];
            }
            return [
              name,
              {
                type: { kind: "optional", innerType: field.type },
                name: {
                  text: field.name.text,
                },
                doc: field.doc,
              } satisfies SyntheticField,
            ];
          }),
        ),
      };
    }
  }

  const exampleType: SyntheticInterface = {
    kind: "interface",
    fields: {
      input: {
        name: {
          text: "input",
        },
        type: inputType,
      },
      output: {
        name: {
          text: "output",
        },
        type: outputType,
      },
      intermediateSteps: {
        name: {
          text: "intermediateSteps",
        },
        type: {
          kind: "optional",
          innerType: {
            kind: "array",
            elementType: {
              kind: "interface",
              fields: {
                toolCalls: {
                  name: {
                    text: "toolCalls",
                  },
                  type: {
                    kind: "array",
                    elementType: {
                      kind: "interface",
                      fields: {
                        tool: {
                          name: {
                            text: "tool",
                          },
                          type: {
                            kind: "synthetic-union",
                            members: {
                              kind: "strings",
                              values: new Set(
                                Object.keys(options.namespaceTools),
                              ),
                            },
                          },
                        },
                        callId: {
                          name: {
                            text: "callId",
                          },
                          type: {
                            kind: "primitive",
                            primitive: { text: "string" },
                          },
                        },
                        input: {
                          name: {
                            text: "input",
                          },
                          type: { kind: "any" },
                        },
                        output: {
                          name: {
                            text: "output",
                          },
                          type: { kind: "any" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
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
  for (const example of (examples as StrictJsonArray).elements) {
    const inputEntry = (example as StrictJsonObject).entries["input"];
    if (inputEntry && inputEntry.value.kind === "object") {
      const variantEntry = inputEntry.value.entries["variant"];
      if (variantEntry) {
        errors.push({
          span: variantEntry.key.firstToken,
          message:
            "Examples must not specify 'variant' when within a <variant> element",
        });
      }
    }
  }
  return errors;
}

function validateToolCallExamples(
  examples: StrictJsonValue,
  namespaceTools: { readonly [name: string]: ToolValidationResult },
): ValidationResult {
  const validationResult = new ValidationResultBuilder();
  if (examples.kind !== "array") {
    return validationResult;
  }
  for (const example of examples.elements) {
    if (example.kind !== "object") continue;
    const intermediateStepsEntry = example.entries["intermediateSteps"];
    if (
      !intermediateStepsEntry ||
      intermediateStepsEntry.value.kind !== "array"
    ) {
      continue;
    }
    for (const step of intermediateStepsEntry.value.elements) {
      if (step.kind !== "object") continue;
      const toolCallsEntry = step.entries["toolCalls"];
      if (!toolCallsEntry || toolCallsEntry.value.kind !== "array") continue;
      for (const toolCall of toolCallsEntry.value.elements) {
        if (toolCall.kind !== "object") continue;
        const { entries } = toolCall;
        const toolEntry = entries["tool"];
        const inputEntry = entries["input"];
        const outputEntry = entries["output"];
        if (
          !toolEntry ||
          toolEntry.value.kind !== "string" ||
          !inputEntry ||
          !outputEntry
        ) {
          continue;
        }

        const toolName = toolEntry.value.value;
        const tool = namespaceTools[toolName];
        if (!tool || tool.kind === "error") continue;

        const { schema } = tool;
        const inputType = schema.typeDeclarations["Input"];
        const outputType = schema.typeDeclarations["Output"];
        if (inputType) {
          validationResult.push(
            validateJson(inputEntry.value, inputType, schema),
          );
        }
        if (outputType) {
          validationResult.push(
            validateJson(outputEntry.value, outputType, schema),
          );
        }
      }
    }
  }
  return validationResult;
}

function validateSnippet(
  snippet: Snippet,
  templateSchema: Schema,
  options: Options,
): ValidationResult {
  const validationResult = new ValidationResultBuilder();
  const { errors, definitionLinks } = validationResult;
  switch (snippet.kind) {
    case "snippet": {
      validationResult.push(
        validateTemplateBody(
          snippet.body,
          templateSchema,
          options.templateTools,
          null,
        ),
      );
      break;
    }
    case "snippet-if": {
      const expressionResult = resolveExpressionType(
        snippet.expression,
        templateSchema,
        null,
      );
      definitionLinks.push(...expressionResult.definitionLinks);
      if (expressionResult.kind === "error") {
        errors.push(...expressionResult.errors);
        break;
      }
      const ifContext = resolveIfExpression(
        snippet.expression,
        expressionResult.type,
        snippet.is,
        templateSchema,
      );
      if (ifContext.kind === "error") {
        errors.push(...ifContext.errors);
        break;
      }
      validationResult.push(
        validateTemplateBody(
          snippet.then,
          templateSchema,
          options.templateTools,
          ifContext.then,
        ),
      );
      validationResult.push(
        validateTemplateBody(
          snippet.else,
          templateSchema,
          options.templateTools,
          ifContext.else,
        ),
      );
      break;
    }
    case "snippet-switch": {
      const expressionResult = resolveExpressionType(
        snippet.expression,
        templateSchema,
        null,
      );
      definitionLinks.push(...expressionResult.definitionLinks);
      if (expressionResult.kind === "error") {
        errors.push(...expressionResult.errors);
        break;
      }
      const switchResult = resolveSwitchExpression(
        snippet.expression,
        expressionResult.type,
        templateSchema,
      );
      if (switchResult.kind === "error") {
        errors.push(...switchResult.errors);
        break;
      }
      const handledCases = new Set(snippet.branches.map((b) => b.case.text));
      const missingCases = Object.keys(switchResult.cases).filter(
        (c) => !handledCases.has(c),
      );
      for (const branch of snippet.branches) {
        const case_: string = branch.case.text;
        if (!switchResult.cases[case_]) {
          errors.push({
            span: branch.case,
            message: `Expression can never be '${case_}'`,
            suggestions: missingCases,
          });
          continue;
        }
        validationResult.push(
          validateTemplateBody(
            branch.body,
            templateSchema,
            options.templateTools,
            null,
          ),
        );
      }
      if (missingCases.length >= 1) {
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

  return validationResult;
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
  const validationErrors = validateJson(toolsValue, toolsType, {
    typeDeclarations: {},
    sharedDeclarations: {},
    unionToMembers: new Map(),
  }).errors;
  if (validationErrors.length >= 1) {
    return {
      kind: "error",
      errors: validationErrors,
    };
  }

  const tools: { [name: string]: TemplateTool } = {};
  for (const e of (toolsValue as StrictJsonArray).elements) {
    const nameValue = (e as StrictJsonObject).entries["tool"]!
      .value as JsonString;
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
          type: {
            kind: "synthetic-union",
            members: {
              kind: "strings",
              values: toolNames,
            },
          },
        },
      },
    },
  };
}

type Options = {
  readonly isVariantSpecialization: boolean;
  readonly namespaceTools: { readonly [name: string]: ToolValidationResult };
  readonly templateTools: { readonly [name: string]: TemplateTool };
};
