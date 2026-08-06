export type Templates = {
  readonly signature: string;
  readonly templates: { [id: string]: Template };
  readonly tools: { [id: string]: Tool };
};

export type Template = {
  readonly name: string;
  readonly namespace: string;
  readonly outputFormat: OutputFormat;
  readonly tools: readonly TemplateTool[];
  readonly contents: TemplateContents;
  readonly snippets: { [name: string]: Snippet };
};

export type OutputFormat = "json" | "text";

export type TemplateTool = {
  readonly id: string;
  readonly name: string;
};

export type TemplateContents =
  | {
      readonly kind: "noVariants";
      readonly content: TemplateContent;
    }
  | {
      readonly kind: "variants";
      readonly variants: { [c: string]: TemplateContent };
      readonly defaultContent: TemplateContent;
    };

export type TemplateContent = {
  readonly meta?: unknown;
  readonly system?: Body;
  readonly user?: Body;
  readonly examples?: readonly FewShotExample[];
};

export type FewShotExample = {
  readonly input: unknown;
  readonly output: unknown;
  readonly intermediateSteps: readonly {
    readonly toolCalls: readonly ToolCallExample[];
  }[];
};

export type ToolCallExample = {
  readonly callId: string;
  readonly toolId: string;
  readonly toolName: string;
  readonly input: unknown;
  readonly output: unknown;
};

export type Body = readonly BodyPiece[];

export type BodyPiece =
  | {
      readonly kind: "text";
      readonly text: string;
    }
  | {
      readonly kind: "insertVal";
      readonly val: Expression;
      readonly format: InsertFormat;
      readonly indent: string;
    }
  | {
      readonly kind: "insertSnippet";
      /** Snippet name. */
      readonly snippet: string;
      /** Only contains whitespace characters. */
      readonly indent: string;
    };

export type InsertFormat = "text" | "json" | "yaml" | "toon" | "csv" | "tsv";

export type Expression =
  | {
      readonly kind: "input";
    }
  | {
      readonly kind: "property";
      readonly left: Expression;
      readonly property: string;
    };

export type Snippet =
  | {
      readonly kind: "snippet";
      readonly body: Body;
    }
  | {
      readonly kind: "snippetIf";
      readonly expression: Expression;
      readonly is: "notNull" | "notEmpty" | "true";
      readonly then: Body;
      readonly else: Body;
    }
  | {
      readonly kind: "snippetSwitch";
      readonly expression: Expression;
      readonly branches: { [c: string]: Body };
    };

export type Tool = {
  readonly id: string;
  readonly name: string;
  readonly description: string;
};
