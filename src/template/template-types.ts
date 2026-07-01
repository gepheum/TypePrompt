import type { Schema } from "../schema/schema-types.js";
import { ElementNode } from "../xml/xml-parser.js";

export type Templates = {
  readonly kind: "success";
  readonly templates: {
    readonly [name: string]: Template;
  };
  readonly meta: Schema | null;
};

export type Template = {
  readonly name: string;
  readonly namespace: string | null;
  readonly metaNode: ElementNode | null;
  readonly schema: Schema;
  readonly args: readonly TemplateArg[];
  readonly content:
    | {
      readonly kind: "no-variants";
      readonly body: readonly TemplatePiece[];
    }
    | {
      readonly kind: "variants";
      readonly bodies: {[variant: string]: readonly TemplatePiece[]};
    };
  readonly xmlContent: string;
};

export type TemplateArg = {
  readonly name: string;
  readonly typeName: string | null;
  readonly doc: string;
};

export type TemplatePiece =
  | {
      readonly kind: "text";
      readonly text: string;
    }
  | {
      readonly kind: "arg";
      readonly name: string;
      /** Can only contain whitespaces. */
      readonly indent: string;
      readonly format: "json" | "toon" | null;
    };

/** Result of parsing a single template file. */
export type TemplateFileParseResult = {
  readonly kind: "success";
  readonly path: string;
  readonly templates: readonly Template[];
  readonly metas: readonly [Schema];
};

