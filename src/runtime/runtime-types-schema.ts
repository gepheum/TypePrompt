import { parseSchema } from "../schema/schema-parser.js";
import { Schema } from "../schema/schema-types.js";
import { validateSchema } from "../schema/schema-validator.js";

const SCHEMA = `
type Templates = {
  hash: string;
  templates: { [id: string]: TemplateSpec };
};

type TemplateSpec = {
  name: string;
  namespace: string;
  outputFormat: OutputFormat;
  contents: TemplateContents;
  snippets: { [name: string]: Snippet };
};

type OutputFormat = "json" | "text";

type TemplateContents =
  | { kind: "no-variants"; content: TemplateContent }
  | {
      kind: "variants";
      variants: {
        [c: string]: TemplateContent;
      };
      defaultContent: TemplateContent;
    };

type TemplateContent = {
  meta?: unknown;
  system?: Body;
  user?: Body;
  examples?: ReadonlyArray<{
    input: unknown;
    output: unknown;
  }>;
};

type Body = BodyPiece[];

type BodyPiece =
  | { kind: "text"; text: string }
  | {
      kind: "insert-val";
      val: Expression;
      format: InsertFormat;
      indent: string;
    }
  | {
      kind: "insert-snippet";
      /** Snippet name. */
      snippet: string;
      /** Only contains whitespace characters. */
      indent: string;
    };

type InsertFormat = "text" | "json" | "yaml" | "toon" | "csv" | "tsv";

type Expression =
  | {
      kind: "input";
    }
  | {
      kind: "property";
      left: Expression;
      property: string;
    };

type Snippet =
  | {
      kind: "snippet";
      body: Body;
    }
  | {
      kind: "snippet-if";
      expression: Expression;
      is: "notNull" | "notEmpty" | "true";
      then: Body;
      else: Body;
    }
  | {
      kind: "snippet-switch";
      expression: Expression;
      branches: { [c: string]: Body };
    };
`;

export const runtimeTypesSchema = ((): Schema => {
  const parseResult = parseSchema({
    text: SCHEMA,
    offsetMap: [{ textPosition: 0, sourcePosition: 0 }],
  });
  if (parseResult.kind === "error") {
    throw new Error(JSON.stringify(parseResult, undefined, 2));
  }
  const schema = validateSchema(parseResult.typeDeclarations, {
    kind: "namespace",
  });
  if (schema.kind === "error") {
    throw new Error(JSON.stringify(schema, undefined, 2));
  }
  return schema;
})();
