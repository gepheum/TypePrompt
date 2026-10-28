export type InferrenceLogEntry = {
  prompt: {
    systemMessage: string;
    userMessage: string;
    tools: {
      name: string;
      description: string;
      inputJsonSchema: any;
    }[];
    examples: {
      userMessage: string;
      steps: {
        toolCalls: {
          callId: string;
          toolName: string;
          stringifiedInput: string;
          stringifiedOutput: string;
        }[];
      }[];
      response: string;
    }[];
    outputFormat:
      | {
          kind: "text";
        }
      | {
          kind: "json";
          jsonSchema: any;
        };
    templateId: string;
    templateInput: any;
  };
  startTimestampMillis: number;
  endTimestampMillis: number;
  intermediateSteps: {
    startTimestampMillis: number;
    endTimestampMillis: number;
    toolCalls: {
      callId: string;
      stringifiedInput: string;
      response:
        | {
            success: true;
            stringifiedOutput: string;
          }
        | {
            success: false;
            error: {
              message: string;
            };
          };
    }[];
  }[];
  rawResponse: string;
  parsedOutput:
    | {
        success: true;
        value: any;
      }
    | {
        success: false;
        error: {
          message: string;
        };
      };
};
