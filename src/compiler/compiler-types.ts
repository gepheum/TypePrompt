import { CTag } from "../ctag/ctag-types.js";
import type { Expression } from "../expression/expression-types.js";
import type { JsonValue } from "../json/json-types.js";
import type { Schema, SchemaParseResult } from "../schema/schema-types.js";
import { LineFinderData } from "../util/line-finder.js";
import type {
  InternalError,
  InternalErrors,
  Span,
  TextSpan,
} from "../util/shared-types.js";

export type CompilationResult = {
  readonly sourceFiles: { readonly [path: string]: SourceFileParseResult };
  readonly metaSchema: SchemaOrError;
  readonly namespaces: { readonly [name: string]: NamespaceResult };
  readonly templates: { readonly [id: string]: TemplateValidationResult };
  /** Includes errors from `sourceFiles`. */
  readonly finalErrors: { readonly [path: string]: InternalError[] };
};

export type SourceFileParseResult = {
  readonly path: string;
  readonly content: string;
  readonly lineFinder: LineFinderData;

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
  readonly schema: SchemaParseResult;
  readonly outputFormat: TextSpan<OutputFormat> | null;
  readonly contents: TemplateContents;
  readonly snippets: readonly Snippet[];
};

export type OutputFormat = "json" | "text";

export type TemplateContents =
  | { readonly kind: "no-variants"; readonly content: TemplateContent }
  | {
      readonly kind: "variants";
      readonly variants: readonly TemplateVariant[];
      readonly defaultContent: Partial<TemplateContent>;
    };

export type TemplateContent = {
  readonly meta: TemplateMeta | undefined;
  readonly system: Body;
  readonly user: Body;
  readonly examples: JsonValue<"strict"> | undefined;
};

export type TemplateVariant = {
  readonly tag: Span;
  /** Variant name. */
  readonly case: TextSpan;
  readonly content: Partial<TemplateContent>;
};

export type TemplateMeta = {
  readonly tag: Span;
  readonly value: JsonValue<"strict">;
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
      readonly format: TextSpan<InsertFormat> | null;
      /** Only contains whitespace characters. */
      readonly indent: string;
    }
  | {
      readonly kind: "insert-snippet";
      readonly snippet: TextSpan;
      /** Only contains whitespace characters. */
      readonly indent: string;
    };

export type InsertFormat = "text" | "json" | "yaml" | "toon" | "csv" | "tsv";

export type Snippet =
  | {
      readonly kind: "snippet";
      readonly name: TextSpan;
      readonly body: Body;
    }
  | {
      readonly kind: "snippet-if";
      readonly name: TextSpan;
      readonly expression: Expression;
      readonly is: TextSpan<"notNull" | "notEmpty"> | null;
      readonly then: BodyInContext;
      readonly else: BodyInContext;
    }
  | {
      readonly kind: "snippet-switch";
      readonly name: TextSpan;
      readonly switchTag: Span;
      readonly expression: Expression;
      readonly branches: ReadonlyArray<{
        readonly case: TextSpan;
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

export type NamespaceResult = {
  /** Name of the namespace. */
  readonly name: string;
  readonly schema: SchemaOrError;
  readonly templates: readonly ValidatedTemplate[];
};

export type SchemaOrError =
  Schema | InternalErrors | { readonly kind: "other-error" };

export type ValidatedTemplate = {
  readonly kind: "success";
  readonly template: Template;
  readonly schema: Schema;
};

export type TemplateValidationResult = ValidatedTemplate | InternalErrors;
