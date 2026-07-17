import { JsonValue } from "../json/json-types.js";
import { InternalError, InternalErrors } from "../util/error-types.js";
import { XmlDocument } from "../xml/xml-types.js";

export type CompilationResult = {
  readonly pathToErrors: { readonly [path: string]: readonly InternalError[] };
  readonly sourceFiles: { readonly [path: string]: SourceFile };
  readonly xmlSourceToTemplate: { readonly [xmlSource: string]: Template };
};

export type SourceFile = {
  readonly path: string;
  readonly content: string;
  readonly xmlDocument: XmlDocument | InternalErrors;
};

export type Template = {
  readonly kind: "success";
  /** Includes the <template>...</template> tags. */
  readonly xmlSource: string;

  readonly name: string;
  readonly namespace: string;

  readonly meta: JsonValue<"strict"> | null;
  readonly outputFormat: string;

  readonly contents:
    | { readonly kind: "no-variant"; readonly content: TemplateContent }
    | {
        readonly kind: "variants";
        readonly variants: { readonly [variant: string]: TemplateContent };
      };

  readonly snippets: { readonly [snippet: string]: Snippet };
};

export type TemplateContent = {
  readonly system: Body;
  readonly user: Body;
  readonly examples: JsonValue<"strict"> | null;
};

export type Body = readonly BodyPiece[];

export type BodyPiece =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "insert-val"; readonly val: string }
  | { readonly kind: "insert-snippet"; readonly snippet: string };

export type Snippet =
  | {
    readonly kind: "snippet";
    readonly name: string;
    readonly body: Body;
  }
  | {
    readonly kind: "snippet-if";
    readonly name: string;
    readonly condition: string;
    readonly thenBody: Body;
    readonly elseBody: Body;
  }
  | {
    readonly kind: "snippet-switch";
    readonly name: string;
    readonly val: string;
    readonly cases: ReadonlyArray<{
      readonly when: string;
      readonly body: Body;
    }>;
  };
