// Copied from generated code. Source of truth: 'src/runtime/runtime-types-schema.ts'
// Do not edit.

// <generated:spec>
export type Templates = {
  readonly edition: number;
  readonly signature: string;
  readonly templates: { [id: string]: Template };
  readonly tools: { [id: string]: Tool };
  readonly singleNamespace: boolean;
  /** The key is a relative path to a .xml file. The value is the file content. */
  readonly sourceFiles: { [path: string]: string };
};

export type Template = {
  readonly name: string;
  readonly namespace: string;
  readonly outputFormat: OutputFormat;
  readonly tools: readonly TemplateTool[];
  readonly contents: TemplateContents;
  readonly snippets: { [name: string]: Snippet };
  readonly outputJsonSchema?: unknown;
};

export type OutputFormat = "json" | "text";

export type TemplateTool = {
  readonly id: string;
  readonly name: string;
};

export type TemplateContents =
  | {
      readonly kind: "no-variants";
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
      readonly kind: "insert-val";
      readonly val: Expression;
      readonly format: InsertFormat;
      readonly indent: string;
    }
  | {
      readonly kind: "insert-snippet";
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
      readonly kind: "snippet-if";
      readonly expression: Expression;
      readonly is: "not-null" | "not-empty" | "true";
      readonly then: Body;
      readonly else: Body;
    }
  | {
      readonly kind: "snippet-switch";
      readonly expression: Expression;
      readonly branches: { [c: string]: Body };
    };

export type Tool = {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly inputJsonSchema?: unknown;
};
// </generated:spec>
