import { expect } from "buckwheat";
import { describe, it } from "mocha";
import { formatTemplateFile } from "./formatter.js";

describe("formatTemplateFile", () => {
  it("formats a standard template with schema, tools, system, and user tags", async () => {
    const unformatted = `<template name="Translate">
<schema output-format="text">
interface Input{text:string;}
type Output=string;
</schema>
<tools><tool name="webSearch" /></tools>
<system>You are a translator.</system>
<user><insert val="input.text"/></user>
</template>`;

    const formatted = await formatTemplateFile(unformatted);
    expect(formatted).toBe(
      `<template name="Translate">
  <schema output-format="text">
    interface Input {
      text: string;
    }
    type Output = string;
  </schema>
  <tools>
    <tool name="webSearch" />
  </tools>
  <system>
    You are a translator.
  </system>
  <user>
    <insert val="input.text" />
  </user>
</template>
`,
    );
  });

  it("returns unformatted content when XML has syntax errors", async () => {
    const invalidXml = "<template><unclosed>";
    const formatted = await formatTemplateFile(invalidXml);
    expect(formatted).toBe(invalidXml);
  });

  it("returns unformatted content when comments are in TypeScript code", async () => {
    const xmlWithCommentInCode = `<template name="Test">
<schema output-format="text">
<!-- A comment in schema -->
interface Input {
  text: string;
}
type Output = string;
</schema>
<system>Hello</system>
</template>`;
    const formatted = await formatTemplateFile(xmlWithCommentInCode);
    expect(formatted).toBe(xmlWithCommentInCode);
  });

  it("reorders elements in template before formatting", async () => {
    const unformatted = `<template name="Reordered">
<user><insert val="input.text"/></user>
<system>You are an assistant.</system>
<tools><tool name="webSearch" /></tools>
<schema output-format="text">
interface Input{text:string;}
type Output=string;
</schema>
<meta>
model: gpt-4o
</meta>
</template>`;

    const formatted = await formatTemplateFile(unformatted);
    expect(formatted).toBe(
      `<template name="Reordered">
  <meta>
    model: gpt-4o
  </meta>
  <schema output-format="text">
    interface Input {
      text: string;
    }
    type Output = string;
  </schema>
  <tools>
    <tool name="webSearch" />
  </tools>
  <system>
    You are an assistant.
  </system>
  <user>
    <insert val="input.text" />
  </user>
</template>
`,
    );
  });

  it("reorders description before schema when formatting a tool", async () => {
    const unformatted = `<tool name="webSearch">
<schema>
interface Input{query:string;}
type Output=string;
</schema>
<description>Search web</description>
</tool>`;

    const formatted = await formatTemplateFile(unformatted);
    expect(formatted).toBe(
      `<tool name="webSearch">
  <description>
    Search web
  </description>
  <schema>
    interface Input {
      query: string;
    }
    type Output = string;
  </schema>
</tool>
`,
    );
  });

  it("reorders elements inside variant tags when formatting", async () => {
    const unformatted = `<template name="VariantTest">
<schema output-format="text">
interface Input{}
type Output=string;
</schema>
<variant case="a">
<user>Variant U</user>
<system>Variant S</system>
</variant>
</template>`;

    const formatted = await formatTemplateFile(unformatted);
    expect(formatted).toBe(
      `<template name="VariantTest">
  <schema output-format="text">
    interface Input {}
    type Output = string;
  </schema>
  <variant case="a">
    <system>
      Variant S
    </system>
    <user>
      Variant U
    </user>
  </variant>
</template>
`,
    );
  });

  it("reorders attributes when formatting", async () => {
    const unformatted = `<template name="AttrTest">
<schema output-format="text">
interface Input{
  flag?: string;
}
type Output=string;
</schema>
<system>
<insert snippet="mySnippet"/>
</system>
<user>User</user>
<snippet is="notNull" if="input.flag" name="mySnippet">
<then>Hello</then>
<else/>
</snippet>
</template>`;

    const formatted = await formatTemplateFile(unformatted);
    expect(formatted).toBe(
      `<template name="AttrTest">
  <schema output-format="text">
    interface Input {
      flag?: string;
    }
    type Output = string;
  </schema>
  <system>
    <insert snippet="mySnippet" />
  </system>
  <user>
    User
  </user>
  <snippet name="mySnippet" if="input.flag" is="notNull">
    <then>
      Hello
    </then>
    <else />
  </snippet>
</template>
`,
    );
  });

  it("escapes < and & when inserting formatted TypeScript code into schema", async () => {
    const unformatted = `<template name="TypescriptEscaping">
<schema output-format="text">
interface Input{
  // Check if a < b and c > d
  category: "rock &amp; roll" | "pop &lt; rock" | "hip > hop";
}
type Output=string;
</schema>
<system>Hello</system>
<user>World</user>
</template>`;

    const formatted = await formatTemplateFile(unformatted);
    expect(formatted).toBe(
      `<template name="TypescriptEscaping">
  <schema output-format="text">
    interface Input {
      // Check if a &lt; b and c > d
      category: "rock &amp; roll" | "pop &lt; rock" | "hip > hop";
    }
    type Output = string;
  </schema>
  <system>
    Hello
  </system>
  <user>
    World
  </user>
</template>
`,
    );

    // Verify idempotency: formatting again produces the exact same result
    const reformatting = await formatTemplateFile(formatted);
    expect(reformatting).toBe(formatted);
  });

  it("escapes < and & when inserting formatted YAML code into meta and examples", async () => {
    const unformatted = `<template name="YamlEscaping">
<schema output-format="text">
type Output=string;
</schema>
<meta>
summary: "Rock & Roll < Pop > Jazz"
</meta>
<system>Hello</system>
<user>World</user>
<examples>
- input: "hello & world < foo > bar"
  output: "baz"
</examples>
</template>`;

    const formatted = await formatTemplateFile(unformatted);
    expect(formatted).toBe(
      `<template name="YamlEscaping">
  <meta>
    summary: "Rock &amp; Roll &lt; Pop > Jazz"
  </meta>
  <schema output-format="text">
    type Output = string;
  </schema>
  <system>
    Hello
  </system>
  <user>
    World
  </user>
  <examples>
    - input: "hello &amp; world &lt; foo > bar"
      output: "baz"
  </examples>
</template>
`,
    );

    // Verify idempotency: formatting again produces the exact same result
    const reformatting = await formatTemplateFile(formatted);
    expect(reformatting).toBe(formatted);
  });

  it("unescapes > in formatted TypeScript and YAML when it was escaped in original source", async () => {
    const unformatted = `<template name="UnescapeGreaterThan">
<meta>
summary: "Rock &gt; Pop"
</meta>
<schema output-format="text">
interface Input {
  // 5 &gt; 3
  level: "high &gt; low";
}
type Output = string;
</schema>
<system>Hello</system>
<user>World</user>
<examples>
- input: "a &gt; b"
  output: "ok"
</examples>
</template>`;

    const formatted = await formatTemplateFile(unformatted);
    expect(formatted).toBe(
      `<template name="UnescapeGreaterThan">
  <meta>
    summary: "Rock > Pop"
  </meta>
  <schema output-format="text">
    interface Input {
      // 5 > 3
      level: "high > low";
    }
    type Output = string;
  </schema>
  <system>
    Hello
  </system>
  <user>
    World
  </user>
  <examples>
    - input: "a > b"
      output: "ok"
  </examples>
</template>
`,
    );

    // Verify idempotency: formatting again produces the exact same result
    const reformatting = await formatTemplateFile(formatted);
    expect(reformatting).toBe(formatted);
  });
});
