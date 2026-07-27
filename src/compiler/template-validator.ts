import { validateCTag } from "../ctag/ctag-validator.js";
import { validateJson } from "../json/json-type-checker.js";
import {
  Schema,
  SchemaValidationContext,
  SyntheticArray,
  SyntheticInterface,
  Type,
} from "../schema/schema-types.js";
import { validateSchema } from "../schema/schema-validator.js";
import { resolveType } from "../schema/type-resolver.js";
import { getUnionMembers } from "../schema/unions.js";
import { InternalError, Span } from "../util/shared-types.js";
import {
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

  const examplesInterface = makeExamplesType(template, templateSchema);

  const templateContents: Array<Partial<TemplateContent>> = [];
  switch (template.contents.kind) {
    case "no-variants": {
      templateContents.push(template.contents.content);
      break;
    }
    case "variants": {
      templateContents.push(template.contents.defaultContent);
      for (const variant of template.contents.variants) {
        templateContents.push(variant.content);
      }
      break;
    }
  }
  for (const templateContent of templateContents) {
    for (const body of [templateContent.system, templateContent.user]) {
      if (!body) continue;
      for (const piece of body) {
        if (piece.kind !== "c-tag") continue;
        errors.push(...validateCTag(piece.cTag, templateSchema));
      }
    }
    if (templateContent.examples) {
      errors.push(
        ...validateJson(
          templateContent.examples,
          templateSchema,
          examplesInterface,
        ),
      );
    }
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
        message: "Output must be an interface when using <variant> elements",
      },
    ];
  }
  const variantField = outputType.fields["variant"];
  if (!variantField) {
    return [
      {
        span: outputTypeDeclaration.name,
        message:
          "Output must have a 'variant' field when using <variant> elements",
      },
    ];
  }
  const makeVariantFieldTypeError = (): readonly InternalError[] => [
    {
      span: variantField.name,
      message: "'Output.variant' must be a union of string literals",
    },
  ];
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
  const unionMembers = getUnionMembers(variantFieldType, templateSchema);
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

function makeExamplesType(
  template: Template,
  templateSchema: Schema,
): SyntheticArray {
  const { typeDeclarations } = templateSchema;

  const inputType = typeDeclarations["Input"]!.valueType;

  let outputType: Type | SyntheticInterface =
    typeDeclarations["Output"]!.valueType;
  if (template.contents.kind === "variants") {
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
          Object.entries(resolvedOutputType.fields).filter(
            ([name, _]) => name !== "variant",
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
      },
      output: {
        name: {
          text: "output",
        },
        optional: false,
        type: outputType,
      },
    },
  };

  return {
    kind: "synthetic-array",
    elementType: exampleType,
  };
}
