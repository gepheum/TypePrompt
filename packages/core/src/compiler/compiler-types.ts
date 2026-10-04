import { CTag } from "../ctag/ctag-types.js";
import type { Expression } from "../expression/expression-types.js";
import type { StrictJsonValue } from "../json/json-types.js";
import type { Schema, SchemaParseResult } from "../schema/schema-types.js";
import { LineFinderData } from "../util/line-finder.js";
import type {
  InternalError,
  InternalErrors,
  Span,
  TextSpan,
} from "../util/shared-types.js";
import { XmlDocument } from "../xml/xml-types.js";

export type CompilationResult = {
  readonly sourceFiles: { readonly [path: string]: SourceFileParseResult };
  readonly metaSchema: SchemaOrError;
  readonly namespaces: { readonly [name: string]: NamespaceResult };
  /** Set if there is exactly one namespace. */
  readonly singleNamespace: NamespaceResult | null;
  readonly templates: { readonly [id: string]: TemplateValidationResult };
  readonly tools: { readonly [id: string]: ToolValidationResult };
  /** Includes errors from `sourceFiles`. */
  readonly finalErrors: { readonly [path: string]: InternalError[] };
  readonly anyErrors: boolean;
  readonly warnings: { readonly [path: string]: InternalError[] };
};

/** A {@link CompilationResult} known not to have any errors. */
export type ValidCompilationResult = CompilationResult & {
  readonly metaSchema: Schema;
  readonly namespaces: { readonly [name: string]: ValidNamespaceResult };
  readonly singleNamespace: ValidNamespaceResult | null;
  readonly templates: { readonly [id: string]: ValidTemplate };
  readonly tools: { readonly [id: string]: ValidatedTool };
};

export type SourceFileParseResult = {
  readonly path: string;
  readonly content: string;
  readonly lineFinder: LineFinderData;

  readonly xmlDocument: XmlDocument | InternalErrors;

  readonly entity: Template | Tool | Namespace | Meta | undefined;

  readonly parseErrors: readonly InternalError[];
  readonly warnings: readonly InternalError[];
};

export type Template = {
  readonly kind: "template";
  /** Path to the XML file where the template is defined. */
  readonly sourcePath: string;
  readonly tag: Span;
  readonly name: TextSpan;
  readonly namespace: TextSpan | null;
  readonly schema: SchemaParseResult;
  readonly tools: StrictJsonValue | null;
  readonly outputFormat: TextSpan<OutputFormat> | null;
  readonly contents: TemplateContents;
  readonly snippets: readonly Snippet[];
  readonly warnings: readonly InternalError[];
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
  readonly examples: StrictJsonValue | undefined;
};

export type TemplateVariant = {
  readonly tag: Span;
  /** Variant name. */
  readonly case: TextSpan;
  readonly content: Partial<TemplateContent>;
};

export type TemplateMeta = {
  readonly tag: Span;
  readonly value: StrictJsonValue;
};

export type Body<HasValContext extends boolean = false> = ReadonlyArray<
  BodyPiece<HasValContext>
>;

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
      /** The insert tag. */
      readonly tag: Span;
    }
  | {
      readonly kind: "insert-snippet";
      readonly snippet: TextSpan;
      /** Only contains whitespace characters. */
      readonly indent: string;
      /** The insert tag. */
      readonly tag: Span;
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
      readonly is: TextSpan<"notNull" | "notEmpty" | "true"> | null;
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
        readonly body: Body;
      }>;
    };

/** Top-level <tool> element. */
export type Tool = {
  readonly kind: "tool";
  readonly name: TextSpan;
  readonly namespace: TextSpan | null;
  readonly description: ToolDescription;
  readonly schema: SchemaParseResult;
  readonly warnings: readonly InternalError[];
};

export type ToolDescription = readonly ToolDescriptionPiece[];

export type ToolDescriptionPiece =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "c-tag"; readonly text: string; readonly cTag: CTag };

/** Top-level <namespace> element. */
export type Namespace = {
  readonly kind: "namespace";
  readonly name: TextSpan;
  readonly schema: SchemaOrError;
  readonly warnings: readonly InternalError[];
};

/** Top-level <meta> element. */
export type Meta = {
  readonly kind: "meta";
  readonly tag: Span;
  readonly schema: SchemaOrError;
  readonly warnings: readonly InternalError[];
};

export type NamespaceResult = {
  /** Name of the namespace. */
  readonly name: string;
  readonly schema: SchemaOrError;
  readonly tools: { readonly [name: string]: ToolValidationResult };
  readonly templates: readonly ValidatedTemplate[];
};

/** A {@link NamespaceResult} known not to have any errors. */
export type ValidNamespaceResult = NamespaceResult & {
  /** Name of the namespace. */
  readonly schema: Schema;
  readonly tools: { readonly [name: string]: ValidatedTool };
  readonly templates: readonly ValidTemplate[];
};

export type SchemaOrError =
  Schema | InternalErrors | { readonly kind: "other-error" };

export type ValidatedTool = {
  readonly kind: "tool";
  readonly tool: Tool;
  readonly schema: Schema;
};

export type ToolValidationResult = ValidatedTool | InternalErrors;

export type ValidatedTemplate = {
  readonly kind: "template";
  readonly template: Template;
  readonly schema: Schema;
  readonly tools: { readonly [name: string]: TemplateTool };
};

/** A {@link ValidatedTemplate} known not to have any errors. */
export type ValidTemplate = ValidatedTemplate & {
  readonly tools: { readonly [name: string]: ValidTemplateTool };
};

/** Tool called from a template. */
export type TemplateTool = {
  readonly tool: ToolValidationResult;
};

export type ValidTemplateTool = TemplateTool & {
  readonly tool: ValidatedTool;
};

export type TemplateValidationResult = ValidatedTemplate | InternalErrors;

// =============================================================================
// Static assertion
// =============================================================================

type Expect<T extends true> = T;
type IsAssignable<A, B> = [A] extends [B] ? true : false;

// Usage:
type _Check = Expect<IsAssignable<ValidCompilationResult, CompilationResult>>;
