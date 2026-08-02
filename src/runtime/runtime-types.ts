export type Templates = {
  readonly templates: { readonly [id: string]: TemplateSpec };
};

export type TemplateSpec = {
  readonly name: string;
  readonly namespace: string;
  readonly outputFormat: OutputFormat;
  readonly contents: TemplateContents;
  readonly snippets: { readonly [name: string]: Snippet };
};

export type OutputFormat = "json" | "text";

export type TemplateContents =
  | { readonly kind: "no-variants"; readonly content: TemplateContent }
  | {
      readonly kind: "variants";
      readonly variants: {
        readonly [c: string]: TemplateContent;
      };
      readonly defaultContent: TemplateContent;
    };

export type TemplateContent = {
  readonly meta?: unknown;
  readonly system?: Body;
  readonly user?: Body;
  readonly examples?: ReadonlyArray<{
    readonly input: unknown;
    readonly output: unknown;
  }>;
};

export type Body = readonly BodyPiece[];

export type BodyPiece =
  | { readonly kind: "text"; readonly text: string }
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
      readonly is: "notNull" | "notEmpty" | "true";
      readonly then: Body;
      readonly else: Body;
    }
  | {
      readonly kind: "snippet-switch";
      readonly expression: Expression;
      readonly branches: { readonly [c: string]: Body };
    };
