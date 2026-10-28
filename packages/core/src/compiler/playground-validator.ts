import type {
  JsonString,
  StrictJsonArray,
  StrictJsonObject,
  StrictJsonValue,
} from "../json/json-types.js";
import { validateJson } from "../json/json-validator.js";
import { unwrapJsonValue } from "../json/unwrapper.js";
import type {
  HasName,
  Schema,
  SyntheticArray,
  SyntheticInterface,
} from "../schema/schema-types.js";
import type {
  DefinitionLink,
  TextSpan,
  ValidationResult,
} from "../util/shared-types.js";
import { stripQuotes } from "../util/spans.js";
import { ValidationResultBuilder } from "../util/validation-result-builder.js";
import type {
  Dataset,
  DatasetValidationResult,
  Sample,
  SampleIntermediateStep,
  SampleToolCall,
  TemplateTool,
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
  if (!typeDeclarations["Input"]) {
    return {
      kind: "error",
      errors: [
        {
          span: dataset.for,
          message: `Template '${dataset.for.text}' is missing Input schema declaration`,
        },
      ],
      definitionLinks: [],
      dataset,
    };
  }

  const datasetType = makeDatasetType(
    templateValidation.schema,
    templateValidation.tools,
  );
  const jsonResult = validateJson(
    dataset.samples,
    datasetType,
    templateValidation.schema,
  );
  validationResult.push(jsonResult);

  if (jsonResult.errors.length <= 0) {
    validationResult.push(
      validateSampleToolCalls(dataset.samples, templateValidation.tools),
    );
  }

  definitionLinks.push(...validationResult.definitionLinks);

  if (validationResult.errors.length > 0) {
    return {
      kind: "error",
      errors: validationResult.errors,
      definitionLinks,
      dataset,
    };
  }

  const samples: Sample[] = (dataset.samples as StrictJsonArray).elements.map(
    (el) => {
      const obj = el as StrictJsonObject;
      const nameEntry = obj.entries["name"];
      const inputEntry = obj.entries["input"]!;
      const intermediateStepsEntry = obj.entries["intermediateSteps"];

      const intermediateSteps: SampleIntermediateStep[] | undefined =
        intermediateStepsEntry && intermediateStepsEntry.value.kind === "array"
          ? intermediateStepsEntry.value.elements.map((stepEl) => {
              const stepObj = stepEl as StrictJsonObject;
              const toolCallsEntry = stepObj.entries["toolCalls"];
              const toolCalls: SampleToolCall[] =
                toolCallsEntry && toolCallsEntry.value.kind === "array"
                  ? toolCallsEntry.value.elements.map((tcEl) => {
                      const tcObj = tcEl as StrictJsonObject;
                      const toolNameNode = tcObj.entries["tool"]!
                        .value as JsonString;
                      const toolName = jsonStringToTextSpan(toolNameNode);
                      const callIdNode = tcObj.entries["callId"]!
                        .value as JsonString;
                      const callId = jsonStringToTextSpan(callIdNode);
                      const outputEntry = tcObj.entries["output"];
                      const toolObj = templateValidation.tools[toolName.text];
                      const toolNamespace =
                        toolObj?.tool.tool.namespace?.text ?? DEFAULT_NAMESPACE;
                      const toolId = `${toolNamespace}:${toolName.text}`;
                      return {
                        callId,
                        toolId,
                        toolName,
                        input: tcObj.entries["input"]!.value,
                        output: outputEntry?.value,
                      };
                    })
                  : [];
              return { toolCalls };
            })
          : undefined;

      return {
        name:
          nameEntry?.value.kind === "string"
            ? jsonStringToTextSpan(nameEntry.value)
            : undefined,
        input: unwrapJsonValue(inputEntry.value),
        intermediateSteps,
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
    samples,
    definitionLinks,
  };
}

function makeDatasetType(
  templateSchema: Schema,
  tools: { readonly [name: string]: TemplateTool },
): SyntheticArray & HasName {
  const { typeDeclarations } = templateSchema;
  const inputType = typeDeclarations["Input"]!.valueType;

  const sampleType: SyntheticInterface = {
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
      intermediateSteps: {
        name: { text: "intermediateSteps" },
        type: {
          kind: "optional",
          innerType: {
            kind: "array",
            elementType: {
              kind: "interface",
              fields: {
                toolCalls: {
                  name: { text: "toolCalls" },
                  type: {
                    kind: "array",
                    elementType: {
                      kind: "interface",
                      fields: {
                        tool: {
                          name: { text: "tool" },
                          type: {
                            kind: "synthetic-union",
                            members: {
                              kind: "strings",
                              values: Object.fromEntries(
                                Object.entries(tools).map(([k, t]) => [
                                  k,
                                  {
                                    kind: "unquoted",
                                    unquotedName: t.tool.tool.name,
                                  },
                                ]),
                              ),
                            },
                          },
                        },
                        callId: {
                          name: { text: "callId" },
                          type: {
                            kind: "primitive",
                            primitive: { text: "string" },
                          },
                        },
                        input: {
                          name: { text: "input" },
                          type: { kind: "any" },
                        },
                        output: {
                          name: { text: "output" },
                          type: {
                            kind: "optional",
                            innerType: { kind: "any" },
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
    },
  };

  return {
    kind: "array",
    name: {
      text: "dataset",
    },
    elementType: sampleType,
  };
}

function validateSampleToolCalls(
  samples: StrictJsonValue,
  tools: { readonly [name: string]: TemplateTool },
): ValidationResult {
  const validationResult = new ValidationResultBuilder();
  if (samples.kind !== "array") {
    return validationResult;
  }
  for (const sample of samples.elements) {
    if (sample.kind !== "object") continue;
    const intermediateStepsEntry = sample.entries["intermediateSteps"];
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
        if (toolEntry?.value.kind !== "string" || !inputEntry) continue;

        const toolName = toolEntry.value.value;
        const templateTool = tools[toolName];
        if (!templateTool || templateTool.tool.kind === "error") continue;

        const { schema } = templateTool.tool;
        const inputType = schema.typeDeclarations["Input"];
        const outputType = schema.typeDeclarations["Output"];
        if (inputType) {
          validationResult.push(
            validateJson(inputEntry.value, inputType.valueType, schema),
          );
        }
        if (outputType && outputEntry) {
          validationResult.push(
            validateJson(outputEntry.value, outputType.valueType, schema),
          );
        }
      }
    }
  }
  return validationResult;
}

function jsonStringToTextSpan(node: JsonString): TextSpan {
  const span = node.quoted ? stripQuotes(node.firstToken) : node.firstToken;
  return {
    ...span,
    text: node.value,
  };
}
