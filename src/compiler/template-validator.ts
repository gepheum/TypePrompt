import { validateCTag } from "../ctag/ctag-validator.js";
import { resolveExpressionType } from "../expression/expression-type-resolver.js";
import { ExpressionContext } from "../expression/expression-types.js";
import { resolveIfExpression } from "../expression/if-expression-resolver.js";
import { resolveSwitchExpression } from "../expression/switch-expression-resolver.js";
import { validateJson } from "../json/json-type-checker.js";
import { JsonValue } from "../json/json-types.js";
import {
  ResolvedType,
  Schema,
  SchemaValidationContext,
  SyntheticArray,
  SyntheticInterface,
  SyntheticType,
  Type,
} from "../schema/schema-types.js";
import { validateSchema } from "../schema/schema-validator.js";
import { resolveType } from "../schema/type-resolver.js";
import { InternalError, Span } from "../util/shared-types.js";
import {
  Body,
  InsertFormat,
  Snippet,
  Template,
  TemplateContent,
  TemplateValidationResult,
} from "./compiler-types.js";

export function validateTemplate(args: {
  template: Template;
  metaSchema: Schema;
  namespaceSchema: Schema;
}): TemplateValidationResult {
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
): SyntheticArray {
  const { typeDeclarations } = templateSchema;

  const inputType = typeDeclarations["Input"]!.valueType;

  let outputType: Type | SyntheticInterface =
    typeDeclarations["Output"]!.valueType;
  if (options.isVariantSpecialization) {
    const resolvedOutputType = resolveType(outputType!, templateSchema);
    if (
      resolvedOutputType.kind === "interface" &&
      resolvedOutputType.fields["variant"]
    ) {
      outputType = {
        kind: "synthetic-interface",
        name: {
          text: "Output",
        },
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

  const exampleType: SyntheticInterface = {
    kind: "synthetic-interface",
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
    kind: "synthetic-array",
    elementType: exampleType,
  };
}

function verifyVariantFieldNotSet(
  examples: JsonValue<"strict">,
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

function validateBody<HasValContext extends boolean>(
  body: Body<HasValContext>,
  templateSchema: Schema,
  context: HasValContext extends true ? ExpressionContext : null,
): readonly InternalError[] {
  const errors: InternalError[] = [];
  for (const piece of body) {
    if (piece.kind === "c-tag") {
      errors.push(...validateCTag(piece.cTag, templateSchema));
      continue;
    } else if (piece.kind !== "insert-val") {
      continue;
    }
    const expression = piece.val;
    const type = resolveExpressionType(expression, templateSchema, context);
    if (type.kind === "error") {
      errors.push(...type.errors);
      continue;
    } else if (type.kind === "null") {
      errors.push({
        span: expression.fullPath,
        message: "Always null",
      });
      continue;
    } else if (type.kind === "nullable") {
      errors.push({
        span: expression.fullPath,
        message: "May be null",
      });
      continue;
    }
    if (!piece.format) {
      if (!isStringType(type, templateSchema)) {
        errors.push({
          span: expression.fullPath,
          message: "Not a string type and no format specified",
          hint: "Add a format attribute, for example format='json'",
        });
      }
      continue;
    }
    const insertFormat: InsertFormat = piece.format.text;
    switch (insertFormat) {
      case "text": {
        if (!isStringType(type, templateSchema)) {
          errors.push({
            span: piece.format,
            message: "'text' can only be used with string types",
          });
        }
        break;
      }
      case "csv":
      case "tsv": {
        if (!isTabularType(type, templateSchema)) {
          errors.push({
            span: piece.format,
            message: `'${insertFormat}' can only be used with tabular types`,
            rule: "A tabular type is an array of objects with only string or integer fields",
          });
        }
        break;
      }
      case "json":
      case "yaml":
      case "toon": {
        break;
      }
      default: {
        const _: never = insertFormat;
        throw _;
      }
    }
  }
  return errors;
}

function isStringType(
  type: ResolvedType | SyntheticType,
  schema: Schema,
): boolean {
  switch (type.kind) {
    case "primitive":
      return type.primitive.text === "string";
    case "string-literal":
      return true;
    case "union":
      return schema.unionToMembers.get(type)!.kind === "strings";
    default:
      return false;
  }
}

function isTabularType(type: ResolvedType, schema: Schema): boolean {
  if (type.kind !== "array") {
    return false;
  }
  const elementType = resolveType(type.elementType, schema);
  if (elementType.kind !== "interface") {
    return false;
  }
  return Object.values(elementType.fields).every((field) => {
    if (field.optional) {
      return false;
    }
    const fieldType = resolveType(field.type, schema);
    return (
      isStringType(fieldType, schema) ||
      (fieldType.kind === "primitive" && fieldType.primitive.text === "integer")
    );
  });
}
