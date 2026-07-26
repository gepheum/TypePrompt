import { CTag } from "../ctag/ctag-types.js";
import type { Expression } from "../expression/expression-types.js";
import type { JsonValue } from "../json/json-types.js";
import type { Schema, SchemaParseResult } from "../schema/schema-types.js";
import type {
  InternalError,
  InternalErrors,
  Span,
  TextSpan,
} from "../util/shared-types.js";

export type CompilationResult = {
  readonly sourceFiles: { readonly [path: string]: SourceFileParseResult };
  readonly metaSchema: SchemaOrError;
  readonly namespaceSchemas: { readonly [name: string]: SchemaOrError };
  readonly templates: { readonly [id: string]: TemplateValidationResult };
  readonly validationErrors: { readonly [path: string]: InternalError[] };
};

export type SourceFileParseResult = {
  readonly path: string;
  readonly content: string;

  readonly templates: readonly Template[];
  readonly namespaces: readonly Namespace[];
  readonly metas: readonly Meta[];

  readonly parseErrors: readonly InternalError[];
};

export type Template = {
  readonly kind: "success";
  readonly tag: Span;
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
  readonly variant: TextSpan;
  readonly content: PromptContent;
};

export type PromptContent = {
  readonly system: Body;
  readonly user: Body;
  readonly examples: JsonValue<"strict"> | null;
};

export type Body<HasValContext extends boolean = false> =
  readonly BodyPiece<HasValContext>[];

export type BodyInContext = Body<true>;

export type BodyPiece<HasValContext extends boolean = false> =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "c-tag"; readonly text: string; readonly cTag: CTag }
  | {
      readonly kind: "insert-val";
      readonly val: Expression<HasValContext>;
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

export type InsertFormat = "text" | "json" | "toon" | "csv" | "tsv";

export type Snippet =
  | {
      readonly kind: "snippet";
      readonly name: TextSpan;
      readonly body: BodyInContext;
    }
  | {
      readonly kind: "snippet-if";
      readonly name: TextSpan;
      readonly expression: Expression;
      readonly is: "notNull" | "notEmpty" | null;
      readonly then: BodyInContext;
      readonly else: BodyInContext;
    }
  | {
      readonly kind: "snippet-switch";
      readonly name: TextSpan;
      readonly expression: Expression;
      readonly cases: ReadonlyArray<{
        readonly option: string;
        readonly body: BodyInContext;
      }>;
    };

/** Top-level <namespace> element. */
export type Namespace = {
  readonly kind: "namespace";
  readonly name: TextSpan;
  readonly schema: Schema;
};

/** Top-level <meta> element. */
export type Meta = {
  readonly kind: "meta";
  readonly tag: Span;
  readonly schema: Schema;
};

export type SchemaOrError =
  Schema | InternalErrors | { readonly kind: "other-error" };

export type TemplateValidationResult =
  | {
      kind: "success";
      readonly template: Template;
      readonly schema: Schema;
    }
  | InternalErrors;
