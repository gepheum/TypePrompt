import { CTag } from "../ctag/ctag-types.js";
import { JsonValue } from "../json/json-types.js";
import { SchemaParseResult } from "../schema/schema-types.js";
import {
  InternalError,
  InternalErrors,
  Span,
  TextSpan,
} from "../util/common-types.js";
import { XmlDocument } from "../xml/xml-types.js";

export type CompilationResult = {
  readonly pathToErrors: { readonly [path: string]: readonly InternalError[] };
  readonly sourceFiles: { readonly [path: string]: SourceFile };
  readonly xmlSourceToTemplate: {
    readonly [xmlSource: string]: TemplateResult;
  };
};

export type SourceFile = {
  readonly path: string;
  readonly content: string;
  readonly xmlDocument: XmlDocument | InternalErrors;
};

export type TemplateResult =
  | {
      readonly kind: "success";
      readonly template: Template;
      /**
       * When we reuse a cached template, the `positionOffset` is used to adjust the
       * positions of the template's SourceSpans to match their positions in the new
       * source file.
       */
      readonly positionOffset: number;
    }
  | InternalErrors;

export type Template = {
  readonly kind: "success";
  readonly name: TextSpan;
  readonly namespace: TextSpan | null;
  readonly meta: JsonValue<"strict"> | null;
  readonly schema: SchemaParseResult;
  readonly outputFormat: OutputFormat | null;
  readonly contents: PromptContents;
  readonly snippets: readonly Snippet[];
};

export type OutputFormat = {
  readonly kind: "json" | "text" | "custom";
  readonly format: TextSpan;
};

export type PromptContents =
  | { readonly kind: "no-variants"; readonly content: PromptContent }
  | {
      readonly kind: "variants";
      readonly variants: readonly PromptVariant[];
    };

export type PromptVariant = {
  /** Variant name. */
  readonly variant: Span;
  readonly content: PromptContent;
};

export type PromptContent = {
  readonly system: Body;
  readonly user: Body;
  readonly examples: JsonValue<"strict"> | null;
};

export type Body = readonly BodyPiece[];

export type BodyPiece =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "c-tag"; readonly cTag: CTag }
  | {
      readonly kind: "insert-val";
      readonly val: Expression;
      readonly format: InsertFormat | null;
      /** Only contains whitespace characters. */
      readonly indent: string;
    }
  | {
      readonly kind: "insert-snippet";
      readonly snippet: TextSpan;
      /** Only contains whitespace characters. */
      readonly indent: string;
    };

export type Expression =
  | { readonly kind: "input"; span: Span }
  | { readonly kind: "it"; span: Span }
  | {
      readonly kind: "property";
      readonly left: Expression;
      readonly operator: "." | "?.";
      readonly operatorSpan: Span;
      readonly property: TextSpan;
    };

export type InsertFormat =
  | "text" | "json" | "toon" | "csv" | "tsv";

export type Snippet =
  | {
      readonly kind: "snippet";
      readonly name: string;
      readonly body: Body;
    }
  | {
      readonly kind: "snippet-if";
      readonly name: string;
      readonly condition: Expression;
      readonly thenBody: Body;
      readonly elseBody: Body;
    }
  | {
      readonly kind: "snippet-switch";
      readonly name: string;
      readonly val: Expression;
      readonly cases: ReadonlyArray<{
        readonly when: string;
        readonly body: Body;
      }>;
    };
