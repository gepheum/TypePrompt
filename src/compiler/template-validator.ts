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
import { InternalError } from "../util/shared-types.js";
import {
  PromptContent,
  Template,
  TemplateValidationResult,
} from "./compiler-types.js";

export function validateTemplate(args: {
  template: Template;
  metaSchema: Schema;
  namespaceSchema: Schema;
}): TemplateValidationResult {
  const { template, metaSchema, namespaceSchema } = args;

  const errors: InternalError[] = [];

  const metaType = metaSchema.typeDeclarations["Meta"];
  if (template.meta) {
    if (metaType) {
      errors.push(...validateJson(template.meta, metaSchema, metaType));
    } else {
      errors.push({
        span: template.tag,
        message: "Missing <meta> element",
      });
    }
  } else if (metaType) {
    errors.push({
      span: metaType.name,
      message: "Missing <meta> element at the top level",
    });
  }

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

  const promptContents: PromptContent[] = [];
  switch (template.contents.kind) {
    case "no-variants": {
      promptContents.push(template.contents.content);
      break;
    }
    case "variants": {
      for (const variant of template.contents.variants) {
        promptContents.push(variant.content);
      }
      break;
    }
  }
  for (const promptContent of promptContents) {
    for (const body of [promptContent.system, promptContent.user]) {
      for (const piece of body) {
        if (piece.kind !== "c-tag") {
          continue;
        }
        const cTagErrors = validateCTag(piece.cTag, templateSchema);
        errors.push(...cTagErrors);
      }
    }
    if (promptContent.examples) {
      errors.push(
        ...validateJson(
          promptContent.examples,
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
        message: "Output type must be an interface when using variants",
      },
    ];
  }
  const variantField = outputType.fields["variant"];
  if (!variantField) {
    return [
      {
        span: outputTypeDeclaration.name,
        message: "Output type must have a 'variant' field when using variants",
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
      message: `'${variantName}' is not a member of the 'Output.variant' union`,
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
