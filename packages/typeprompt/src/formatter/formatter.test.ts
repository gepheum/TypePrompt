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
<tools>- tool: webSearch</tools>
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
    - tool: webSearch
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
});
