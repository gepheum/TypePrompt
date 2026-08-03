// This file is auto-generated. Do not edit it directly.

import { encode as encodeToon } from "@toon-format/toon";
import YAML from "yaml";
import * as z from "zod";

export type PromptMaker = {
  readonly default: {
    readonly myTemplate: Template<$.Default.MyTemplate.Input, $.Default.MyTemplate.Output>;
  };
};

export type Meta = $.Meta.Meta;

export namespace $ {
  export namespace Meta {
    export type Meta = {
      /** Temperature setting for the template */
      readonly temperature: number;
      readonly foobar: (
        | "foo"
        | "bar"
      );
    };
  }

  export namespace Default {
    export namespace MyTemplate {
      export type Input = {
        readonly firstName: string;
        readonly lastName: string;
        readonly fooToBar: { [name: string]: number };
      };

      export type Output = {
        readonly x: number;
      };
    }
  }
}

export type TemplateId = (
  | "Default:MyTemplate"
);

namespace Spec {
  export type Templates = {
    readonly signature: string;
    readonly templates: { [id: string]: TemplateSpec };
  };

  export type TemplateSpec = {
    readonly name: string;
    readonly namespace: string;
    readonly outputFormat: OutputFormat;
    readonly contents: TemplateContents;
    readonly snippets: { [name: string]: Snippet };
  };

  export type OutputFormat = (
    | "json"
    | "text"
  );

  export type TemplateContents = (
    | {
      readonly kind: "noVariants";
      readonly content: TemplateContent;
    }
    | {
      readonly kind: "variants";
      readonly variants: { [c: string]: TemplateContent };
      readonly defaultContent: TemplateContent;
    }
  );

  export type TemplateContent = {
    readonly meta: unknown;
    readonly system: Body;
    readonly user: Body;
    readonly examples: readonly {
      readonly input: unknown;
      readonly output: unknown;
    }[];
  };

  export type Body = readonly BodyPiece[];

  export type BodyPiece = (
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
    }
  );

  export type InsertFormat = (
    | "text"
    | "json"
    | "yaml"
    | "toon"
    | "csv"
    | "tsv"
  );

  export type Expression = (
    | {
      readonly kind: "input";
    }
    | {
      readonly kind: "property";
      readonly left: Expression;
      readonly property: string;
    }
  );

  export type Snippet = (
    | {
      readonly kind: "snippet";
      readonly body: Body;
    }
    | {
      readonly kind: "snippetIf";
      readonly expression: Expression;
      readonly is: (
        | "notNull"
        | "notEmpty"
        | "true"
      );
      readonly then: Body;
      readonly else: Body;
    }
    | {
      readonly kind: "snippetSwitch";
      readonly expression: Expression;
      readonly branches: { [c: string]: Body };
    }
  );
}



