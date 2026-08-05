import { parseSchema } from "../schema/schema-parser.js";
import { Schema } from "../schema/schema-types.js";
import { validateSchema } from "../schema/schema-validator.js";

const SCHEMA = `
type Templates = {
  signature: string;
  templates: { [id: string]: Template };
  tools: { [id: string]: Tool };
};

type Template = {
  name: string;
  namespace: string;
  outputFormat: OutputFormat;
  tools: TemplateTool[];
  contents: TemplateContents;
  snippets: { [name: string]: Snippet };
};

type OutputFormat = "json" | "text";

type TemplateTool = {
  id: string;
  name: string;
};

type TemplateContents =
  | { kind: "noVariants"; content: TemplateContent }
  | {
      kind: "variants";
      variants: { [c: string]: TemplateContent };
      defaultContent: TemplateContent;
    };

type TemplateContent = {
  meta?: any;
  system?: Body;
  user?: Body;
  examples?: ({
    input: any;
    output: any;
  })[];
};

type Body = BodyPiece[];

type BodyPiece =
  | { kind: "text"; text: string }
  | {
      kind: "insertVal";
      val: Expression;
      format: InsertFormat;
      indent: string;
    }
  | {
      kind: "insertSnippet";
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
      kind: "snippetIf";
      expression: Expression;
      is: "notNull" | "notEmpty" | "true";
      then: Body;
      else: Body;
    }
  | {
      kind: "snippetSwitch";
      expression: Expression;
      branches: { [c: string]: Body };
    };

type Tool = {
  id: string;
  name: string;
  description: string;
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
