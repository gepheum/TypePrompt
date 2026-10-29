import type {
  JsonString,
  StrictJsonArray,
  StrictJsonObject,
  StrictJsonObjectEntry,
  StrictJsonValue,
} from "../json/json-types.js";
import { validateJson } from "../json/json-validator.js";
import { unwrapJsonValue } from "../json/unwrapper.js";
import type {
  HasName,
  Schema,
  SyntheticArray,
  SyntheticField,
  SyntheticInterface,
  SyntheticOptional,
} from "../schema/schema-types.js";
import type {
  DefinitionLink,
  TextSpan,
  ValidationResult,
} from "../util/shared-types.js";
import { stripQuotes } from "../util/spans.js";
import { ValidationResultBuilder } from "../util/validation-result-builder.js";
import type {
  Playground,
  PlaygroundValidationResult,
  Sample,
  SampleHistoryEntry,
  SampleStep,
  SampleToolCall,
  TemplateTool,
  ValidatedTemplate,
} from "./compiler-types.js";
import { DEFAULT_NAMESPACE } from "./default-namespace.js";

/** Validates a top-level <playground> element against its target template. */
export function validatePlayground(
  playground: Playground,
  templateValidation: ValidatedTemplate,
): PlaygroundValidationResult {
  const validationResult = new ValidationResultBuilder();
  const definitionLinks: DefinitionLink[] = [
    {
      reference: playground.for,
      definition: templateValidation.template.name,
    },
  ];

  const playgroundType = makePlaygroundType(
    templateValidation.schema,
    templateValidation.tools,
  );
  const jsonResult = validateJson(
    playground.samples,
    playgroundType,
    templateValidation.schema,
  );
  validationResult.push(jsonResult);

  if (jsonResult.errors.length <= 0) {
    validationResult.push(
      validateSampleToolCalls(playground.samples, templateValidation.tools),
    );
  }

  definitionLinks.push(...validationResult.definitionLinks);

  if (validationResult.errors.length > 0) {
    return {
      kind: "error",
      errors: validationResult.errors,
      definitionLinks,
      playground,
    };
  }

  const samples: Sample[] = (
    playground.samples as StrictJsonArray
  ).elements.map((el) => {
    const obj = el as StrictJsonObject;
    const nameEntry = obj.entries["name"];
    const historyEntry = obj.entries["history"];
    const inputEntry = obj.entries["input"]!;
    const stepsEntry = obj.entries["steps"];

    const history: SampleHistoryEntry[] | undefined =
      historyEntry && historyEntry.value.kind === "array"
        ? historyEntry.value.elements.map((histEl) => {
            const histObj = histEl as StrictJsonObject;
            const histInput = histObj.entries["input"]!;
            const histOutput = histObj.entries["output"]!;
            const histSteps = parseSteps(
              histObj.entries["steps"],
              templateValidation,
            );
            return {
              input: unwrapJsonValue(histInput.value),
              steps: histSteps,
              output: unwrapJsonValue(histOutput.value),
            };
          })
        : undefined;

    const steps = parseSteps(stepsEntry, templateValidation);

    return {
      name:
        nameEntry?.value.kind === "string"
          ? jsonStringToTextSpan(nameEntry.value)
          : undefined,
      history,
      input: unwrapJsonValue(inputEntry.value),
      steps,
    };
  });

  const namespace =
    templateValidation.template.namespace?.text ?? DEFAULT_NAMESPACE;
  const templateId = `${namespace}:${templateValidation.template.name.text}`;

  return {
    kind: "playground",
    playground,
    templateId,
    samples,
    definitionLinks,
  };
}

function parseSteps(
  stepsEntry: StrictJsonObjectEntry | undefined,
  templateValidation: ValidatedTemplate,
): SampleStep[] | undefined {
  if (!stepsEntry || stepsEntry.value.kind !== "array") {
    return undefined;
  }
  return (stepsEntry.value as StrictJsonArray).elements.map((stepEl) => {
    const stepObj = stepEl as StrictJsonObject;
    const toolCallsEntry = stepObj.entries["toolCalls"];
    const toolCalls: SampleToolCall[] =
      toolCallsEntry && toolCallsEntry.value.kind === "array"
        ? toolCallsEntry.value.elements.map((tcEl) => {
            const tcObj = tcEl as StrictJsonObject;
            const toolNameNode = tcObj.entries["tool"]!.value as JsonString;
            const toolName = jsonStringToTextSpan(toolNameNode);
            const callIdNode = tcObj.entries["callId"]!.value as JsonString;
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
  });
}

function makePlaygroundType(
  templateSchema: Schema,
  tools: { readonly [name: string]: TemplateTool },
): SyntheticArray & HasName {
  const { typeDeclarations } = templateSchema;
  const inputType = typeDeclarations["Input"]!.valueType;
  const outputType = typeDeclarations["Output"]!.valueType;

  const toolCallsField: SyntheticField = {
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
  };

  const stepsType: SyntheticOptional = {
    kind: "optional",
    innerType: {
      kind: "array",
      elementType: {
        kind: "interface",
        fields: {
          toolCalls: toolCallsField,
        },
      },
    },
  };

  const historyEntryType: SyntheticInterface = {
    kind: "interface",
    fields: {
      input: {
        name: { text: "input" },
        type: inputType,
      },
      steps: {
        name: { text: "steps" },
        type: stepsType,
      },
      output: {
        name: { text: "output" },
        type: outputType,
      },
    },
  };

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
      history: {
        name: { text: "history" },
        type: {
          kind: "optional",
          innerType: {
            kind: "array",
            elementType: historyEntryType,
          },
        },
      },
      input: {
        name: { text: "input" },
        type: inputType,
      },
      steps: {
        name: { text: "steps" },
        type: stepsType,
      },
    },
  };

  return {
    kind: "array",
    name: {
      text: "samples",
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

    validateStepsToolCalls(sample.entries["steps"], tools, validationResult);

    const historyEntry = sample.entries["history"];
    if (historyEntry && historyEntry.value.kind === "array") {
      for (const item of historyEntry.value.elements) {
        if (item.kind !== "object") continue;
        validateStepsToolCalls(item.entries["steps"], tools, validationResult);
      }
    }
  }
  return validationResult;
}

function validateStepsToolCalls(
  stepsEntry: StrictJsonObjectEntry | undefined,
  tools: { readonly [name: string]: TemplateTool },
  validationResult: ValidationResultBuilder,
): void {
  if (!stepsEntry || stepsEntry.value.kind !== "array") {
    return;
  }
  for (const step of stepsEntry.value.elements) {
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

function jsonStringToTextSpan(node: JsonString): TextSpan {
  const span = node.quoted ? stripQuotes(node.firstToken) : node.firstToken;
  return {
    ...span,
    text: node.value,
  };
}
