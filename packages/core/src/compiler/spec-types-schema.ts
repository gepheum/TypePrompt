import { parseSchema } from "../schema/schema-parser.js";
import type { Schema } from "../schema/schema-types.js";
import { validateSchema } from "../schema/schema-validator.js";

const SCHEMA = `
type Templates = {
  edition: integer;
  signature: string;
  templates: { [id: string]: Template };
  tools: { [id: string]: Tool };
  /** The key is a relative path to a .tp file. The value is the file content. */
  sourceFiles: { [path: string]: string };
};

type Template = {
  name: string;
  namespace: string;
  outputFormat: OutputFormat;
  tools: TemplateTool[];
  contents: TemplateContents;
  snippets: { [name: string]: Snippet };
  outputJsonSchema: any;
};

type OutputFormat = "json" | "text";

type TemplateTool = {
  id: string;
  name: string;
};

type TemplateContents =
  | { kind: "no-variants"; content: TemplateContent }
  | {
      kind: "variants";
      variants: { [c: string]: TemplateContent };
      defaultContent: TemplateContent;
    };

type TemplateContent = {
  meta?: any;
  system?: Body;
  user?: Body;
  examples?: FewShotExample[];
};

type FewShotExample = {
  input: any;
  output: any;
  steps: {
    toolCalls: ToolCallExample[];
  }[];
};

type ToolCallExample = {
  callId: string;
  toolId: string;
  toolName: string;
  input: any;
  output: any;
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
      is: "not-null" | "not-empty" | "true";
      then: Body;
      else: Body;
    }
  | {
      kind: "snippet-switch";
      expression: Expression;
      branches: { [c: string]: Body };
    };

type Tool = {
  id: string;
  name: string;
  description: string;
  inputJsonSchema: any;
};
`;

export const runtimeTypesSchema = ((): Schema => {
  const parseResult = parseSchema(
    {
      path: "Runtime.tp",
      text: SCHEMA,
      offsetMap: [{ textPosition: 0, sourcePosition: 0 }],
    },
    "internal",
  );
  if (parseResult.kind === "error") {
    throw new Error(JSON.stringify(parseResult, undefined, 2));
  }
  const schema = validateSchema(parseResult, null);
  if (schema.kind === "error") {
    throw new Error(JSON.stringify(schema, undefined, 2));
  }
  return schema;
})();
