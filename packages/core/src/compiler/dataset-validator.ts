import type { StrictJsonArray, StrictJsonObject } from "../json/json-types.js";
import { validateJson } from "../json/json-validator.js";
import { unwrapJsonValue } from "../json/unwrapper.js";
import type {
  HasName,
  Schema,
  SyntheticArray,
  SyntheticInterface,
} from "../schema/schema-types.js";
import type { DefinitionLink } from "../util/shared-types.js";
import { ValidationResultBuilder } from "../util/validation-result-builder.js";
import type {
  Dataset,
  DatasetItem,
  DatasetValidationResult,
  ValidatedTemplate,
} from "./compiler-types.js";
import { DEFAULT_NAMESPACE } from "./default-namespace.js";

/** Validates a top-level <dataset> element against its target template. */
export function validateDataset(
  dataset: Dataset,
  templateValidation: ValidatedTemplate,
): DatasetValidationResult {
  const validationResult = new ValidationResultBuilder();
  const definitionLinks: DefinitionLink[] = [
    {
      reference: dataset.for,
      definition: templateValidation.template.name,
    },
  ];

  const { typeDeclarations } = templateValidation.schema;
  if (!typeDeclarations["Input"] || !typeDeclarations["Output"]) {
    return {
      kind: "error",
      errors: [
        {
          span: dataset.for,
          message: `Template '${dataset.for.text}' is missing Input or Output schema declaration`,
        },
      ],
      definitionLinks: [],
      dataset,
    };
  }

  const datasetType = makeDatasetType(templateValidation.schema);
  const jsonResult = validateJson(
    dataset.items,
    datasetType,
    templateValidation.schema,
  );
  validationResult.push(jsonResult);
  definitionLinks.push(...jsonResult.definitionLinks);

  if (validationResult.errors.length > 0) {
    return {
      kind: "error",
      errors: validationResult.errors,
      definitionLinks,
      dataset,
    };
  }

  const items: DatasetItem[] = (dataset.items as StrictJsonArray).elements.map(
    (el) => {
      const obj = el as StrictJsonObject;
      const nameEntry = obj.entries["name"];
      const inputEntry = obj.entries["input"]!;
      const weightEntry = obj.entries["weight"];
      const outputEntry = obj.entries["output"];

      return {
        name: nameEntry
          ? (unwrapJsonValue(nameEntry.value) as string)
          : undefined,
        input: unwrapJsonValue(inputEntry.value),
        weight: weightEntry
          ? (unwrapJsonValue(weightEntry.value) as number)
          : undefined,
        output: outputEntry ? unwrapJsonValue(outputEntry.value) : undefined,
        raw: el,
      };
    },
  );

  const namespace =
    templateValidation.template.namespace?.text ?? DEFAULT_NAMESPACE;
  const templateId = `${namespace}:${templateValidation.template.name.text}`;

  return {
    kind: "dataset",
    dataset,
    templateId,
    items,
    definitionLinks,
  };
}

function makeDatasetType(templateSchema: Schema): SyntheticArray & HasName {
  const { typeDeclarations } = templateSchema;
  const inputType = typeDeclarations["Input"]!.valueType;
  const outputType = typeDeclarations["Output"]!.valueType;

  const datasetItemType: SyntheticInterface = {
    kind: "interface",
    fields: {
      name: {
        name: { text: "name" },
        type: {
          kind: "optional",
          innerType: { kind: "primitive", primitive: { text: "string" } },
        },
      },
      input: {
        name: { text: "input" },
        type: inputType,
      },
      weight: {
        name: { text: "weight" },
        type: {
          kind: "optional",
          innerType: { kind: "primitive", primitive: { text: "number" } },
        },
      },
      output: {
        name: { text: "output" },
        type: {
          kind: "optional",
          innerType: outputType,
        },
      },
    },
  };

  return {
    kind: "array",
    name: {
      text: "dataset",
    },
    elementType: datasetItemType,
  };
}
