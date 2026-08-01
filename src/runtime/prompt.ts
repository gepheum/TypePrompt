import * as z from "zod";

export type Prompt<Output, Input = unknown> = {
  readonly meta: Meta;
  readonly systemInstructions: string;
  readonly userInstructions: string;
  readonly examples: readonly FewShotExample[];
  readonly outputType: z.ZodType<Output>;
  readonly templateId: TemplateId;
  readonly templateInput: Input;
};

export type Meta = {
};

export type TemplateId = string;

export type FewShotExample = {
  readonly userInstructions: string;
  readonly assistantResponse: string;
};
