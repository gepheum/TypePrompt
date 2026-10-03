import YAML from "yaml";
import { CompilationResult } from "../compiler/compiler-types.js";
import { FieldType, SchemaView } from "../schema/schema-types.js";
import { resolveType } from "../schema/type-resolver.js";
import { parseXmlDocument } from "../xml/xml-parser.js";

export function onKeyDown(
  _key: ">",
  xmlContent: string,
  position: number,
  compilationResult: CompilationResult | null,
):
  | {
      readonly action: "none";
    }
  | {
      readonly action: "insert-after";
      readonly text: string;
    } {
  const parseResult = parseXmlDocument(xmlContent);
  if (parseResult.kind !== "error") {
    return { action: "none" };
  }
  const unclosedTag = parseResult.unclosedTags.find(
    (t) => t.endPosition === position,
  );
  if (!unclosedTag) {
    return { action: "none" };
  }
  const { tag, topLevel } = unclosedTag;
  if (!topLevel) {
    return { action: "none" };
  }
  let insertContent = ((): string => {
    switch (tag) {
      case "meta": {
        return "type Meta = {};";
      }
      case "template": {
        return makeTemplateInsertContent(compilationResult);
      }
      case "tool": {
        return makeToolInsertContent();
      }
    }
    return "";
  })();
  if (insertContent) {
    const eolIndent = "\n  ";
    insertContent = eolIndent.concat(
      insertContent.replace(/\n/g, eolIndent),
      eolIndent,
    );
  }
  return {
    action: "insert-after",
    text: `${insertContent}</${tag}>`,
  };
}

function makeTemplateInsertContent(
  compilationResult: CompilationResult | null,
): string {
  let maybeMeta: readonly string[] = [];
  const metaSchema = compilationResult?.metaSchema;
  if (metaSchema?.kind === "success") {
    const metaType = metaSchema.typeDeclarations["Meta"];
    if (metaType) {
      const metaYaml = YAML.stringify(
        makeGoodDefaultValue(metaType.valueType, metaSchema),
      );
      maybeMeta = [
        "",
        "<meta>",
        "  ".concat(metaYaml.replace(/\n/g, "\n  ")),
        "</meta>",
      ];
    }
  }
  return [
    "<schema>",
    "  type Input = {",
    "    question: string;",
    "  };",
    "",
    "  type Output = {",
    "    answer: string;",
    "  };",
    "</schema>",
    ...maybeMeta,
    "",
    "<system>",
    "  Write system instructions here.",
    "</system>",
    "",
    "<user>",
    '  <insert val="input" format="json" />',
    "</user>",
    "",
    "<examples>",
    "  - input:",
    '      question: "What is the secret of the universe?"',
    "    output:",
    '      answer: "42"',
    "</examples>",
  ].join("\n");
}

function makeToolInsertContent(): string {
  return [
    "<schema>",
    "  type Input = {};",
    "",
    "  type Output = {};",
    "</schema>",
    "",
    "<description>",
    "  Describe what the tool does here.",
    "</description>",
  ].join("\n");
}

function makeGoodDefaultValue(type: FieldType, schema: SchemaView): unknown {
  type = resolveType(type, schema);
  switch (type.kind) {
    case "any": {
      return {};
    }
    case "array": {
      return [makeGoodDefaultValue(type.elementType, schema)];
    }
    case "boolean-literal": {
      return type.value satisfies boolean;
    }
    case "interface": {
      return Object.fromEntries(
        Object.values(type.fields).map((f): [string, unknown] => [
          f.name.text,
          makeGoodDefaultValue(f.type, schema),
        ]),
      );
    }
    case "optional": {
      return makeGoodDefaultValue(type.innerType, schema);
    }
    case "primitive": {
      if (type.primitive.text === "boolean") {
        return false;
      } else if (
        type.primitive.text === "integer" ||
        type.primitive.text === "number"
      ) {
        return 0;
      } else {
        return "";
      }
    }
    case "record": {
      return {
        "some-key": makeGoodDefaultValue(type.valueType, schema),
      };
    }
    case "string-literal": {
      return type.value;
    }
    case "union": {
      const first = type.members[0]!;
      return makeGoodDefaultValue(first, schema);
    }
  }
}
