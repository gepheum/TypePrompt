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



