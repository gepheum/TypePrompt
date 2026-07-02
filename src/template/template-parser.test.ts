import { expect } from "buckwheat";
import { describe, it } from "mocha";

import {
  parseTemplateFile,
  type SourceFile,
  type TemplateParseErrors,
} from "./template-parser.js";
import type {
  Template,
  TemplateFileParseResult,
  TemplatePiece,
} from "./template-types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PATH = "test.prompts";

function sf(content: string): SourceFile {
  return { path: PATH, content };
}

function parseOk(content: string): TemplateFileParseResult {
  const result = parseTemplateFile(sf(content));
  if (result.kind !== "success") {
    throw new Error(
      `Expected success but got errors:\n${result.errors.map((e) => `  ${e.message} (offset ${e.startPosition.offset})`).join("\n")}`,
    );
  }
  return result;
}

/** Returns the single template from a parseOk result. */
function singleTemplate(content: string): Template {
  const result = parseOk(content);
  if (result.templates.length !== 1) {
    throw new Error(
      `Expected exactly 1 template, got ${result.templates.length}`,
    );
  }
  return result.templates[0]!;
}

/** Wraps a body string in a minimal valid template. Base indent inside body is 4 spaces. */
function wrapBody(bodyContent: string, schemaSource?: string): string {
  const schema = schemaSource ?? "interface Response { value: string; }";
  return [
    '<template name="Demo">',
    "  <schema>",
    `    ${schema}`,
    "  </schema>",
    "  <body>",
    bodyContent,
    "  </body>",
    "</template>",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Top-level structure
// ---------------------------------------------------------------------------

describe("parseTemplateFile – top-level structure", () => {
  it("succeeds on an empty file", () => {
    const result = parseOk("");
    expect(result).toMatch({ kind: "success", templates: [], metas: [] });
  });

  it("succeeds on a file with only whitespace", () => {
    const result = parseOk("   \n\n   ");
    expect(result).toMatch({ kind: "success", templates: [], metas: [] });
  });

  it("reports error for non-whitespace top-level text", () => {
    const source = "oops";
    const result = parseTemplateFile(sf(source));
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "Unexpected text at the top level" }],
    });
  });

  it("reports error for an unexpected top-level element", () => {
    const source = "<foo/>";
    const result = parseTemplateFile(sf(source));
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "Unexpected element '<foo>'" }],
    });
  });

  it("reports an XML parse error", () => {
    const result = parseTemplateFile(sf("<template name='Foo'>"));
    expect(result).toMatch({ kind: "error", errors: [{}] });
  });
});

// ---------------------------------------------------------------------------
// Top-level <meta>
// ---------------------------------------------------------------------------

describe("parseTemplateFile – top-level <meta>", () => {
  it("parses a valid meta schema", () => {
    const result = parseOk(
      "<meta>\n  interface Meta { temperature: number; }\n</meta>",
    );
    expect(result).toMatch({
      kind: "success",
      metas: [{ kind: "success", types: { Meta: { kind: "interface" } } }],
    });
  });

  it("collects multiple meta schemas", () => {
    const result = parseOk(
      "<meta>\n  interface Meta { a: number; }\n</meta>\n<meta>\n  interface Meta { b: string; }\n</meta>",
    );
    expect(result).toMatch({
      kind: "success",
      metas: [{}, {}],
    });
    expect(result.metas.length).toBe(2);
  });

  it("reports errors inside a meta schema", () => {
    const result = parseTemplateFile(
      sf("<meta>\n  type Meta = string;\n</meta>"),
    );
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "Type 'Meta' must be an interface" }],
    });
  });

  it("reports error for unexpected attribute on top-level <meta>", () => {
    const result = parseTemplateFile(
      sf('<meta foo="bar">\n  interface Meta { x: string; }\n</meta>'),
    );
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "Unexpected attribute 'foo'" }],
    });
  });
});

// ---------------------------------------------------------------------------
// <template> – attribute validation
// ---------------------------------------------------------------------------

describe("parseTemplateFile – template attributes", () => {
  const BODY_SCHEMA = [
    "  <schema>",
    "    interface Response { value: string; }",
    "  </schema>",
    "  <body>text</body>",
  ].join("\n");

  it("reports error for missing name attribute", () => {
    const result = parseTemplateFile(
      sf(`<template>\n${BODY_SCHEMA}\n</template>`),
    );
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "Missing required attribute 'name'" }],
    });
  });

  it("reports error for invalid name (lowercase first char)", () => {
    const result = parseTemplateFile(
      sf(`<template name="demo">\n${BODY_SCHEMA}\n</template>`),
    );
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "Invalid value for attribute 'name'" }],
    });
  });

  it("accepts a valid name", () => {
    const result = parseOk(
      `<template name="Demo">\n${BODY_SCHEMA}\n</template>`,
    );
    expect(result.templates[0]).toMatch({ name: "Demo" });
  });

  it("accepts a valid namespace", () => {
    const result = parseOk(
      `<template name="Demo" namespace="MyNs">\n${BODY_SCHEMA}\n</template>`,
    );
    expect(result.templates[0]).toMatch({ name: "Demo", namespace: "MyNs" });
  });

  it("sets namespace to null when absent", () => {
    const result = parseOk(
      `<template name="Demo">\n${BODY_SCHEMA}\n</template>`,
    );
    expect(result.templates[0]).toMatch({ namespace: null });
  });

  it("reports error for invalid namespace", () => {
    const result = parseTemplateFile(
      sf(
        `<template name="Demo" namespace="my_ns">\n${BODY_SCHEMA}\n</template>`,
      ),
    );
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "Invalid value for attribute 'namespace'" }],
    });
  });

  it("reports error for unknown attribute", () => {
    const result = parseTemplateFile(
      sf(`<template name="Demo" foo="bar">\n${BODY_SCHEMA}\n</template>`),
    );
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "Unexpected attribute 'foo'" }],
    });
  });
});

// ---------------------------------------------------------------------------
// <template> – required elements
// ---------------------------------------------------------------------------

describe("parseTemplateFile – required elements", () => {
  it("reports error for missing <schema>", () => {
    const source = '<template name="Demo">\n  <body>text</body>\n</template>';
    const result = parseTemplateFile(sf(source));
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "Missing <schema> element" }],
    });
  });

  it("reports error for missing <body>", () => {
    const source = [
      '<template name="Demo">',
      "  <schema>",
      "    interface Response { value: string; }",
      "  </schema>",
      "</template>",
    ].join("\n");
    const result = parseTemplateFile(sf(source));
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "Missing <body> element" }],
    });
  });

  it("reports error for multiple <schema> elements", () => {
    const source = [
      '<template name="Demo">',
      "  <schema>interface Response { value: string; }</schema>",
      "  <schema>interface Response { value: string; }</schema>",
      "  <body>text</body>",
      "</template>",
    ].join("\n");
    const result = parseTemplateFile(sf(source));
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "Multiple <schema> elements are not allowed" }],
    });
  });

  it("reports error for multiple <args> elements", () => {
    const source = [
      '<template name="Demo">',
      "  <schema>interface Response { value: string; }</schema>",
      '  <args><arg name="x"/></args>',
      '  <args><arg name="y"/></args>',
      '  <body><arg name="x"/></body>',
      "</template>",
    ].join("\n");
    const result = parseTemplateFile(sf(source));
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "Multiple <args> elements are not allowed" }],
    });
  });

  it("reports error for unexpected child element", () => {
    const source = [
      '<template name="Demo">',
      "  <schema>interface Response { value: string; }</schema>",
      "  <body>text</body>",
      "  <unknown/>",
      "</template>",
    ].join("\n");
    const result = parseTemplateFile(sf(source));
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "Unexpected element '<unknown>'" }],
    });
  });
});

// ---------------------------------------------------------------------------
// <template> – inner <meta> element
// ---------------------------------------------------------------------------

describe("parseTemplateFile – template <meta>", () => {
  it("accepts a self-closing <meta> and stores it as metaNode", () => {
    const source = [
      '<template name="Demo">',
      '  <meta temperature="12.0"/>',
      "  <schema>interface Response { value: string; }</schema>",
      "  <body>text</body>",
      "</template>",
    ].join("\n");
    const t = singleTemplate(source);
    expect(t.metaNode).toMatch({ kind: "element" });
    expect(t.metaNode!.attributes["temperature"]!.decodedValue).toBe("12.0");
  });

  it("sets metaNode to null when <meta> is absent", () => {
    const t = singleTemplate(wrapBody("    text"));
    expect(t.metaNode).toBe(null);
  });

  it("reports error for non-self-closing <meta>", () => {
    const source = [
      '<template name="Demo">',
      "  <meta></meta>",
      "  <schema>interface Response { value: string; }</schema>",
      "  <body>text</body>",
      "</template>",
    ].join("\n");
    const result = parseTemplateFile(sf(source));
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "<meta> element must be self-closing" }],
    });
  });

  it("reports error for multiple <meta> elements", () => {
    const source = [
      '<template name="Demo">',
      '  <meta a="1"/>',
      '  <meta b="2"/>',
      "  <schema>interface Response { value: string; }</schema>",
      "  <body>text</body>",
      "</template>",
    ].join("\n");
    const result = parseTemplateFile(sf(source));
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "Multiple <meta> elements are not allowed" }],
    });
  });
});

// ---------------------------------------------------------------------------
// <schema> element
// ---------------------------------------------------------------------------

describe("parseTemplateFile – <schema>", () => {
  it("parses a valid schema", () => {
    const t = singleTemplate(
      [
        '<template name="Demo">',
        "  <schema>",
        "    interface Response { value: string; }",
        "  </schema>",
        "  <body>text</body>",
        "</template>",
      ].join("\n"),
    );
    expect(t.schema).toMatch({
      kind: "success",
      types: { Response: { kind: "interface" } },
    });
  });

  it("reports schema errors with correct file offset", () => {
    const source = [
      '<template name="Demo">',
      "  <schema>",
      "    type Response = unknown;",
      "  </schema>",
      "  <body>text</body>",
      "</template>",
    ].join("\n");
    const result = parseTemplateFile(sf(source));
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "Unknown type 'unknown'" }],
    });
    // The error offset should point inside the schema text, not at offset 0.
    const err = (result as TemplateParseErrors).errors[0]!;
    expect(err.startPosition.offset).toCompare(">", 0);
  });

  it("reports error for unexpected attribute on <schema>", () => {
    const source = [
      '<template name="Demo">',
      '  <schema hide="true">interface Response { value: string; }</schema>',
      "  <body>text</body>",
      "</template>",
    ].join("\n");
    const result = parseTemplateFile(sf(source));
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "Unexpected attribute 'hide'" }],
    });
  });

  it("reports error for child elements inside <schema>", () => {
    const source = [
      '<template name="Demo">',
      "  <schema><inner/></schema>",
      "  <body>text</body>",
      "</template>",
    ].join("\n");
    const result = parseTemplateFile(sf(source));
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "Unexpected element '<inner>'" }],
    });
  });

  it("uses argTypeNames from <args> when parsing schema", () => {
    // Input type is only used via an arg, not from Response.
    const source = [
      '<template name="Demo">',
      "  <schema>",
      "    interface Response { answer: string; }",
      "    interface Input { question: string; }",
      "  </schema>",
      '  <args><arg name="ctx" type="Input"/></args>',
      '  <body><arg name="ctx" format="json"/></body>',
      "</template>",
    ].join("\n");
    expect(parseOk(source)).toMatch({ kind: "success" });
  });
});

// ---------------------------------------------------------------------------
// <args> element
// ---------------------------------------------------------------------------

describe("parseTemplateFile – <args>", () => {
  function templateWithArgs(argsXml: string, bodyContent: string = ""): string {
    return [
      '<template name="Demo">',
      "  <schema>interface Response { value: string; }</schema>",
      `  <args>${argsXml}</args>`,
      `  <body>${bodyContent}</body>`,
      "</template>",
    ].join("\n");
  }

  it("parses args with name, doc, and type", () => {
    const source = templateWithArgs(
      '<arg name="greeting" doc="A greeting" type="GreetInput"/>',
      '<arg name="greeting" format="json"/>',
    );
    const t = singleTemplate(source);
    expect(t.args).toMatch([
      { name: "greeting", doc: "A greeting", typeName: "GreetInput" },
    ]);
  });

  it("parses arg with name only", () => {
    const t = singleTemplate(
      templateWithArgs('<arg name="msg"/>', '<arg name="msg"/>'),
    );
    expect(t.args).toMatch([{ name: "msg", doc: "", typeName: null }]);
  });

  it("reports error for invalid arg name", () => {
    const result = parseTemplateFile(sf(templateWithArgs('<arg name="Bad"/>')));
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "Invalid value for attribute 'name'" }],
    });
  });

  it("reports error for missing arg name", () => {
    const result = parseTemplateFile(sf(templateWithArgs('<arg doc="hi"/>')));
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "Missing required attribute 'name'" }],
    });
  });

  it("reports error for invalid arg type", () => {
    const result = parseTemplateFile(
      sf(templateWithArgs('<arg name="x" type="bad_type"/>')),
    );
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "Invalid value for attribute 'type'" }],
    });
  });

  it("reports error for non-self-closing <arg> in <args>", () => {
    const result = parseTemplateFile(
      sf(templateWithArgs('<arg name="x"></arg>')),
    );
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "<arg> elements must be self-closing" }],
    });
  });

  it("reports error for unexpected element in <args>", () => {
    const result = parseTemplateFile(sf(templateWithArgs("<unknown/>")));
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "Unexpected element '<unknown>' in <args>" }],
    });
  });

  it("reports error for unexpected attribute on <args>", () => {
    const source = [
      '<template name="Demo">',
      "  <schema>interface Response { value: string; }</schema>",
      '  <args foo="bar"><arg name="x"/></args>',
      '  <body><arg name="x"/></body>',
      "</template>",
    ].join("\n");
    const result = parseTemplateFile(sf(source));
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "Unexpected attribute 'foo'" }],
    });
  });

  it("reports casing ambiguity between declared arg names", () => {
    const source = templateWithArgs(
      '<arg name="myArg"/><arg name="myarg"/>',
      '<arg name="myArg"/><arg name="myarg"/>',
    );
    const result = parseTemplateFile(sf(source));
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: /conflicts with/ }],
    });
  });
});

// ---------------------------------------------------------------------------
// <body> – basic text dedent
// ---------------------------------------------------------------------------

describe("parseTemplateFile – body text dedent", () => {
  it("trims and dedents body text", () => {
    const t = singleTemplate(wrapBody("    Hello world"));
    expect(t.content).toMatch({
      kind: "no-variants",
      body: [{ kind: "text", text: "Hello world" }],
    });
  });

  it("dedents multi-line body text", () => {
    const t = singleTemplate(wrapBody("    Line one\n    Line two"));
    expect(t.content).toMatch({
      kind: "no-variants",
      body: [{ kind: "text", text: "Line one\nLine two" }],
    });
  });

  it("removes leading and trailing empty lines", () => {
    const t = singleTemplate(wrapBody("\n\n    content\n\n"));
    expect(t.content).toMatch({
      kind: "no-variants",
      body: [{ kind: "text", text: "content" }],
    });
  });

  it("produces an empty body for whitespace-only content", () => {
    const t = singleTemplate(wrapBody("\n    \n  "));
    expect(t.content).toMatch({ kind: "no-variants", body: [] });
  });

  it("reports indentation error when a line has less indent than the base", () => {
    const source = [
      '<template name="Demo">',
      "  <schema>interface Response { value: string; }</schema>",
      "  <body>",
      "    line one",
      "  too little indent",
      "  </body>",
      "</template>",
    ].join("\n");
    const result = parseTemplateFile(sf(source));
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: /Expected indentation/ }],
    });
  });

  it("stores xmlContent as the raw content between template tags", () => {
    const inner =
      "\n  <schema>interface Response { value: string; }</schema>\n  <body>hi</body>\n";
    const source = `<template name="Demo">${inner}</template>`;
    const t = singleTemplate(source);
    expect(t.xmlContent).toBe(inner);
  });
});

// ---------------------------------------------------------------------------
// <body> – <arg> pieces
// ---------------------------------------------------------------------------

describe("parseTemplateFile – body <arg> elements", () => {
  it("emits an arg piece with empty indent when arg is inline", () => {
    const t = singleTemplate(wrapBody('    Say: <arg name="greeting"/>'));
    expect(t.content).toMatch({
      kind: "no-variants",
      body: [
        { kind: "text", text: "Say: " },
        { kind: "arg", name: "greeting", indent: "", format: null },
      ],
    });
  });

  it("computes indent when arg starts a dedented line", () => {
    const t = singleTemplate(
      wrapBody('    First line\n      <arg name="greeting"/>'),
    );
    expect(t.content).toMatch({
      kind: "no-variants",
      body: [
        { kind: "text", text: "First line\n  " },
        { kind: "arg", name: "greeting", indent: "  ", format: null },
      ],
    });
  });

  it("infers args from body when <args> is absent", () => {
    const t = singleTemplate(
      wrapBody('    Hello <arg name="firstName"/>, <arg name="lastName"/>'),
    );
    expect(t.args).toMatch([{ name: "firstName" }, { name: "lastName" }]);
  });

  it("deduplicates inferred args", () => {
    const t = singleTemplate(
      wrapBody('    <arg name="x"/> and <arg name="x"/> again'),
    );
    expect(t.args.length).toBe(1);
    expect(t.args[0]).toMatch({ name: "x" });
  });

  it("reports error for non-self-closing body <arg>", () => {
    const source = wrapBody('    <arg name="x"></arg>');
    const result = parseTemplateFile(sf(source));
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "<arg> elements must be self-closing" }],
    });
  });

  it("reports error for undeclared arg when <args> is present", () => {
    const source = [
      '<template name="Demo">',
      "  <schema>interface Response { value: string; }</schema>",
      '  <args><arg name="x"/></args>',
      '  <body><arg name="x"/><arg name="undeclared"/></body>',
      "</template>",
    ].join("\n");
    const result = parseTemplateFile(sf(source));
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "Undeclared arg 'undeclared'" }],
    });
  });

  it("accepts format on a typed arg", () => {
    const source = [
      '<template name="Demo">',
      "  <schema>",
      "    interface Response { value: string; }",
      "    interface Data { items: string[]; }",
      "  </schema>",
      '  <args><arg name="data" type="Data"/></args>',
      '  <body><arg name="data" format="json"/></body>',
      "</template>",
    ].join("\n");
    const t = singleTemplate(source);
    expect(t.content).toMatch({
      kind: "no-variants",
      body: [{ kind: "arg", name: "data", format: "json" }],
    });
  });

  it("reports error when format is missing for arg with declared type", () => {
    const source = [
      '<template name="Demo">',
      "  <schema>interface Response { value: string; }\n  interface Data { items: string[]; }</schema>",
      '  <args><arg name="data" type="Data"/></args>',
      '  <body><arg name="data"/></body>',
      "</template>",
    ].join("\n");
    const result = parseTemplateFile(sf(source));
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "'format' attribute is required for arg 'data'" }],
    });
  });

  it("reports error for format on arg without declared type", () => {
    const source = [
      '<template name="Demo">',
      "  <schema>interface Response { value: string; }</schema>",
      '  <args><arg name="x"/></args>',
      '  <body><arg name="x" format="json"/></body>',
      "</template>",
    ].join("\n");
    const result = parseTemplateFile(sf(source));
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: /format can only be specified/ }],
    });
  });

  it("reports error for format when no <args> is declared", () => {
    const source = wrapBody('    <arg name="x" format="toon"/>');
    const result = parseTemplateFile(sf(source));
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: /format can only be specified/ }],
    });
  });

  it("reports casing ambiguity between inferred arg names", () => {
    const source = wrapBody('    <arg name="myArg"/> and <arg name="myarg"/>');
    const result = parseTemplateFile(sf(source));
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: /conflicts with/ }],
    });
  });
});

// ---------------------------------------------------------------------------
// <body> – <e> elements
// ---------------------------------------------------------------------------

describe("parseTemplateFile – body <e> elements", () => {
  it("emits <e> content as plain text and validates it", () => {
    const t = singleTemplate(
      wrapBody("    Copy the <e>value</e> field."),
      // schema has field 'value' which is an identifier
    );
    expect(t.content).toMatch({
      kind: "no-variants",
      body: [{ kind: "text", text: "Copy the value field." }],
    });
  });

  it("reports error for unknown identifier in <e>", () => {
    const source = wrapBody("    Copy the <e>unknown</e> field.");
    const result = parseTemplateFile(sf(source));
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: /not found in schema/ }],
    });
  });

  it("reports error for child element inside <e>", () => {
    const source = wrapBody("    <e><inner/></e>");
    const result = parseTemplateFile(sf(source));
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "<e> elements cannot contain child elements" }],
    });
  });
});

// ---------------------------------------------------------------------------
// <body> – <enclosed> elements
// ---------------------------------------------------------------------------

describe("parseTemplateFile – body <enclosed> elements", () => {
  it("wraps content with opening and closing XML tags", () => {
    const t = singleTemplate(
      wrapBody('    <enclosed tag="Input">Hello</enclosed>'),
    );
    expect(t.content).toMatch({
      kind: "no-variants",
      body: [{ kind: "text", text: "<Input>Hello</Input>" }],
    });
  });

  it("handles nested <enclosed> elements", () => {
    const t = singleTemplate(
      wrapBody(
        '    <enclosed tag="A"><enclosed tag="B">x</enclosed></enclosed>',
      ),
    );
    expect(t.content).toMatch({
      kind: "no-variants",
      body: [{ kind: "text", text: "<A><B>x</B></A>" }],
    });
  });

  it("handles <arg> inside <enclosed>", () => {
    const t = singleTemplate(
      wrapBody('    <enclosed tag="Ctx"><arg name="msg"/></enclosed>'),
    );
    expect(t.content).toMatch({
      kind: "no-variants",
      body: [
        { kind: "text", text: "<Ctx>" },
        { kind: "arg", name: "msg", indent: "" },
        { kind: "text", text: "</Ctx>" },
      ],
    });
  });

  it("reports error for missing tag attribute on <enclosed>", () => {
    const source = wrapBody("    <enclosed>text</enclosed>");
    const result = parseTemplateFile(sf(source));
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "Missing required attribute 'tag'" }],
    });
  });

  it("reports error for unexpected element in body", () => {
    const source = wrapBody("    <unknown/>");
    const result = parseTemplateFile(sf(source));
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "Unexpected element '<unknown>'" }],
    });
  });
});

// ---------------------------------------------------------------------------
// Variants
// ---------------------------------------------------------------------------

describe("parseTemplateFile – variants", () => {
  function multiVariantTemplate(bodyA: string, bodyB: string): string {
    return [
      '<template name="Demo">',
      "  <schema>interface Response { value: string; }</schema>",
      '  <args><arg name="x"/></args>',
      `  <body variant="A">${bodyA}</body>`,
      `  <body variant="B">${bodyB}</body>`,
      "</template>",
    ].join("\n");
  }

  it("builds a variants content for multiple bodies", () => {
    const t = singleTemplate(
      multiVariantTemplate('<arg name="x"/> hello', 'world <arg name="x"/>'),
    );
    expect(t.content).toMatch({
      kind: "variants",
      bodies: {
        A: [
          { kind: "arg", name: "x" },
          { kind: "text", text: " hello" },
        ],
        B: [
          { kind: "text", text: "world " },
          { kind: "arg", name: "x" },
        ],
      },
    });
  });

  it("builds no-variants content for a single body without variant attr", () => {
    const t = singleTemplate(wrapBody("    text"));
    expect(t.content.kind).toBe("no-variants");
  });

  it("builds variants content for a single body with variant attr", () => {
    const source = [
      '<template name="Demo">',
      "  <schema>interface Response { value: string; }</schema>",
      '  <args><arg name="x"/></args>',
      '  <body variant="A"><arg name="x"/></body>',
      "</template>",
    ].join("\n");
    const t = singleTemplate(source);
    expect(t.content.kind).toBe("variants");
  });

  it("reports error for variant bodies without <args>", () => {
    const source = [
      '<template name="Demo">',
      "  <schema>interface Response { value: string; }</schema>",
      '  <body variant="A">text A</body>',
      '  <body variant="B">text B</body>',
      "</template>",
    ].join("\n");
    const result = parseTemplateFile(sf(source));
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: /explicit <args>/ }],
    });
  });

  it("reports error for duplicate variant names", () => {
    const source = [
      '<template name="Demo">',
      "  <schema>interface Response { value: string; }</schema>",
      '  <args><arg name="x"/></args>',
      '  <body variant="A"><arg name="x"/></body>',
      '  <body variant="A"><arg name="x"/></body>',
      "</template>",
    ].join("\n");
    const result = parseTemplateFile(sf(source));
    expect(result).toMatch({
      kind: "error",
      errors: [
        { message: "Name 'A' is duplicated" },
        { message: "Name 'A' is duplicated" },
      ],
    });
  });

  it("reports error for case-conflicting variant names", () => {
    const source = [
      '<template name="Demo">',
      "  <schema>interface Response { value: string; }</schema>",
      '  <args><arg name="x"/></args>',
      '  <body variant="A"><arg name="x"/></body>',
      '  <body variant="a"><arg name="x"/></body>',
      "</template>",
    ].join("\n");
    const result = parseTemplateFile(sf(source));
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "Name 'a' conflicts with 'A'" }],
    });
  });

  it("reports error when one of multiple bodies lacks a variant attribute", () => {
    const source = [
      '<template name="Demo">',
      "  <schema>interface Response { value: string; }</schema>",
      '  <args><arg name="x"/></args>',
      '  <body variant="A"><arg name="x"/></body>',
      '  <body><arg name="x"/></body>',
      "</template>",
    ].join("\n");
    const result = parseTemplateFile(sf(source));
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: /variant/ }],
    });
  });

  it("reports error for a declared arg unused in a no-variant body", () => {
    const source = [
      '<template name="Demo">',
      "  <schema>interface Response { value: string; }</schema>",
      '  <args><arg name="used"/><arg name="unused"/></args>',
      '  <body><arg name="used"/></body>',
      "</template>",
    ].join("\n");
    const result = parseTemplateFile(sf(source));
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "Arg 'unused' is not used in <body>" }],
    });
  });

  it("reports error for a declared arg unused in one variant body", () => {
    const source = [
      '<template name="Demo">',
      "  <schema>interface Response { value: string; }</schema>",
      '  <args><arg name="x"/><arg name="y"/></args>',
      '  <body variant="A"><arg name="x"/><arg name="y"/></body>',
      '  <body variant="B"><arg name="x"/></body>',
      "</template>",
    ].join("\n");
    const result = parseTemplateFile(sf(source));
    expect(result).toMatch({
      kind: "error",
      errors: [{ message: "Arg 'y' is not used in <body variant=\"B\">" }],
    });
  });
});

// ---------------------------------------------------------------------------
// Multiple templates in one file
// ---------------------------------------------------------------------------

describe("parseTemplateFile – multiple templates", () => {
  it("parses multiple templates from one file", () => {
    const source = [
      '<template name="Foo">',
      "  <schema>interface Response { a: string; }</schema>",
      "  <body>foo</body>",
      "</template>",
      '<template name="Bar">',
      "  <schema>interface Response { b: string; }</schema>",
      "  <body>bar</body>",
      "</template>",
    ].join("\n");
    const result = parseOk(source);
    expect(result.templates.length).toBe(2);
    expect(result.templates[0]).toMatch({ name: "Foo" });
    expect(result.templates[1]).toMatch({ name: "Bar" });
  });

  it("continues parsing subsequent templates even if one has errors", () => {
    const source = [
      '<template name="Foo">',
      "  <schema>INVALID SCHEMA</schema>",
      "  <body>foo</body>",
      "</template>",
      '<template name="Bar">',
      "  <schema>interface Response { b: string; }</schema>",
      "  <body>bar</body>",
      "</template>",
    ].join("\n");
    // Should produce errors (from Foo) but still try to parse Bar.
    const result = parseTemplateFile(sf(source));
    // The result is an error (Foo failed), but we care that Bar errors don't
    // prevent Foo from being attempted.
    expect(result.kind).toBe("error");
  });
});

// ---------------------------------------------------------------------------
// Mixed: meta + template
// ---------------------------------------------------------------------------

describe("parseTemplateFile – meta + template", () => {
  it("parses a file with both a top-level meta and a template", () => {
    const source = [
      "<meta>",
      "  interface Meta { temperature: number; }",
      "</meta>",
      '<template name="Demo">',
      "  <schema>interface Response { value: string; }</schema>",
      "  <body>text</body>",
      "</template>",
    ].join("\n");
    const result = parseOk(source);
    expect(result.metas.length).toBe(1);
    expect(result.templates.length).toBe(1);
    expect(result.templates[0]).toMatch({ name: "Demo" });
  });
});

// ---------------------------------------------------------------------------
// Arg indent – detailed cases
// ---------------------------------------------------------------------------

describe("parseTemplateFile – arg indent calculation", () => {
  it("computes zero indent when arg is at start of line", () => {
    const t = singleTemplate(wrapBody('    <arg name="x"/>'));
    const body = (
      t.content as { kind: "no-variants"; body: readonly TemplatePiece[] }
    ).body;
    const argPiece = body.find((p) => p.kind === "arg") as Extract<
      TemplatePiece,
      { kind: "arg" }
    >;
    expect(argPiece.indent).toBe("");
  });

  it("computes indent after a previous arg on the same line", () => {
    // The indent for the second arg should be "" because the previous arg
    // acts as a non-whitespace sentinel.
    const t = singleTemplate(wrapBody('    <arg name="a"/><arg name="b"/>'));
    const body = (
      t.content as { kind: "no-variants"; body: readonly TemplatePiece[] }
    ).body;
    const bArg = body.find(
      (p) =>
        p.kind === "arg" &&
        (p as Extract<TemplatePiece, { kind: "arg" }>).name === "b",
    ) as Extract<TemplatePiece, { kind: "arg" }>;
    expect(bArg.indent).toBe("");
  });

  it("computes indent inside an <enclosed> element", () => {
    const t = singleTemplate(
      wrapBody(
        '    <enclosed tag="Ctx">\n      <arg name="x"/>\n    </enclosed>',
      ),
    );
    const body = (
      t.content as { kind: "no-variants"; body: readonly TemplatePiece[] }
    ).body;
    const argPiece = body.find((p) => p.kind === "arg") as Extract<
      TemplatePiece,
      { kind: "arg" }
    >;
    // After dedenting (base indent "    "), the line with <arg> has "  " extra indent.
    expect(argPiece.indent).toBe("  ");
  });
});
