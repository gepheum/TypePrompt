export type Template = {
  readonly name: string;
  readonly namespace: string;
  readonly contents: TemplateContents;
};

export type TemplateContents =
  | { readonly kind: "no-variants"; readonly content: TemplateContent }
  | {
      readonly kind: "variants";
      readonly variants: readonly TemplateVariant[];
      readonly defaultContent: Partial<TemplateContent>;
    };

export type TemplateVariant = {
  /** Variant name. */
  readonly case: string;
  readonly content: Partial<TemplateContent>;
};

export type TemplateContent = {
  readonly meta: JsonValue | undefined;
  readonly system: Body;
  readonly user: Body;
  readonly examples: ReadonlyArray<{
    readonly input: JsonValue;
    readonly output: JsonValue;
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

export type JsonValue =
  | JsonObject
  | JsonArray
  | JsonString
  | JsonNumber
  | JsonBoolean
  | JsonNull;

export type JsonObject = {
  readonly kind: "object";
  readonly entries: {readonly [name: string]: JsonValue};
};

export type JsonArray = {
  readonly kind: "array";
  readonly elements: readonly JsonValue[];
};

export type JsonString = {
  readonly kind: "string";
  readonly value: string;
};

export type JsonNumber = {
  readonly kind: "number";
  readonly value: number;
};

export type JsonBoolean = {
  readonly kind: "boolean";
  readonly value: boolean;
};

export type JsonNull = {
  readonly kind: "null";
};

export type Expression =
  | {
      readonly kind: "input";
    }
  | {
      readonly kind: "property";
      readonly left: Expression;
      readonly property: string;
    };
