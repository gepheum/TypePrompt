import { expect } from "buckwheat";
import { describe, it } from "mocha";
import { formatDirectivesInSchema, formatTemplateFile } from "./formatter.js";

describe("formatTemplateFile", () => {
  it("formats a standard template with schema, tools, system, and user tags", async () => {
    const unformatted = `<template name="Translate">
<schema>
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
  <schema>
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
<schema>
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
<schema>
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
  <schema>
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
<schema>
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
  <schema>
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
<schema>
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
  <schema>
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
<schema>
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
  <schema>
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
<schema>
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
  <schema>
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
<schema>
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
  <schema>
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

  it("formats directive comments in schema sections properly", async () => {
    const unformatted = `<template name="Directives">
<schema>
interface Input {
  retries: integer; ///@omitDefault

  timeout: integer;
  ///   @omitDefault   

  debug?: boolean;
}
</schema>
<system>You are a helper.</system>
<user>Run</user>
</template>`;

    const formatted = await formatTemplateFile(unformatted);
    expect(formatted).toBe(
      `<template name="Directives">
  <schema>
    interface Input {
      retries: integer;
      /// @omitDefault
      timeout: integer;
      /// @omitDefault
      debug?: boolean;
    }
  </schema>
  <system>
    You are a helper.
  </system>
  <user>
    Run
  </user>
</template>
`,
    );

    // Verify idempotency
    const reformatting = await formatTemplateFile(formatted);
    expect(reformatting).toBe(formatted);
  });

  it("preserves empty lines before directive comments between fields in schema", async () => {
    const unformatted = `<template name="DirectivesSpacing">
<schema>
interface Input {
  retries: integer;

  /// @omitDefault
  timeout: integer;
}
</schema>
<system>You are a helper.</system>
<user>Run</user>
</template>`;

    const formatted = await formatTemplateFile(unformatted);
    expect(formatted).toBe(
      `<template name="DirectivesSpacing">
  <schema>
    interface Input {
      retries: integer;

      /// @omitDefault
      timeout: integer;
    }
  </schema>
  <system>
    You are a helper.
  </system>
  <user>
    Run
  </user>
</template>
`,
    );

    // Verify idempotency
    const reformatting = await formatTemplateFile(formatted);
    expect(reformatting).toBe(formatted);
  });
});

describe("formatDirectivesInSchema", () => {
  describe("line breaking before '///'", () => {
    it("breaks a line before '///' when non-whitespace chars precede it", () => {
      const input =
        "interface Foo {\n  foo: string; /// @omitDefault\n  bar: string;\n}";
      const output = formatDirectivesInSchema(input);
      expect(output).toBe(
        "interface Foo {\n  foo: string;\n/// @omitDefault\n  bar: string;\n}",
      );
    });

    it("breaks a line when '///' is attached without space", () => {
      const input =
        "interface Foo {\n  foo: string;/// @omitDefault\n  bar: string;\n}";
      const output = formatDirectivesInSchema(input);
      expect(output).toBe(
        "interface Foo {\n  foo: string;\n/// @omitDefault\n  bar: string;\n}",
      );
    });

    it("breaks a line when '///' follows an open brace", () => {
      const input = "interface Foo { /// @omitDefault\n  bar: string;\n}";
      const output = formatDirectivesInSchema(input);
      expect(output).toBe(
        "interface Foo {\n/// @omitDefault\n  bar: string;\n}",
      );
    });

    it("does not break a line when '///' is already on its own line", () => {
      const input = "interface Foo {\n  /// @omitDefault\n  bar: string;\n}";
      const output = formatDirectivesInSchema(input);
      expect(output).toBe(
        "interface Foo {\n  /// @omitDefault\n  bar: string;\n}",
      );
    });

    it("breaks multiple '///' comments on the same line into separate lines", () => {
      const input = "foo: string; /// @first /// @second\nbar: string;";
      const output = formatDirectivesInSchema(input);
      expect(output).toBe(
        "foo: string;\n/// @first\n/// @second\nbar: string;",
      );
    });
  });

  describe("decorator spacing formatting", () => {
    it("formats '///@decorator' with one space after '///'", () => {
      const input = "///@omitDefault\nbar: string;";
      const output = formatDirectivesInSchema(input);
      expect(output).toBe("/// @omitDefault\nbar: string;");
    });

    it("formats multiple spaces between '///' and '@'", () => {
      const input = "///   @omitDefault\nbar: string;";
      const output = formatDirectivesInSchema(input);
      expect(output).toBe("/// @omitDefault\nbar: string;");
    });

    it("removes space between '@' and decorator name", () => {
      const input = "/// @  omitDefault\nbar: string;";
      const output = formatDirectivesInSchema(input);
      expect(output).toBe("/// @omitDefault\nbar: string;");
    });

    it("removes trailing whitespace after decorator name", () => {
      const input = "/// @omitDefault   \nbar: string;";
      const output = formatDirectivesInSchema(input);
      expect(output).toBe("/// @omitDefault\nbar: string;");
    });

    it("handles combinations of messy spacing", () => {
      const input = "  ///   @   omitDefault   \nbar: string;";
      const output = formatDirectivesInSchema(input);
      expect(output).toBe("  /// @omitDefault\nbar: string;");
    });
  });

  describe("empty line removal after '///'", () => {
    it("removes a single empty line immediately after '///'", () => {
      const input = "/// @omitDefault\n\nbar: string;";
      const output = formatDirectivesInSchema(input);
      expect(output).toBe("/// @omitDefault\nbar: string;");
    });

    it("removes multiple empty lines (including whitespace-only) after '///'", () => {
      const input = "/// @omitDefault\n\n   \n\t\nbar: string;";
      const output = formatDirectivesInSchema(input);
      expect(output).toBe("/// @omitDefault\nbar: string;");
    });

    it("preserves empty lines before '///' to separate fields", () => {
      const input =
        "interface Foo {\n  foo: string;\n\n  /// @omitDefault\n  bar: string;\n}";
      const output = formatDirectivesInSchema(input);
      expect(output).toBe(
        "interface Foo {\n  foo: string;\n\n  /// @omitDefault\n  bar: string;\n}",
      );
    });

    it("removes empty lines after each directive when multiple are present", () => {
      const input = "/// @first\n\n/// @second\n\nbar: string;";
      const output = formatDirectivesInSchema(input);
      expect(output).toBe("/// @first\n/// @second\nbar: string;");
    });

    it("removes trailing empty lines at end of file after '///'", () => {
      const input = "/// @omitDefault\n\n   \n";
      const output = formatDirectivesInSchema(input);
      expect(output).toBe("/// @omitDefault\n");
    });
  });

  describe("preservation of strings and other comments", () => {
    it("does not modify '///' inside double-quoted string literals", () => {
      const input = 'type S = "/// @omitDefault";';
      const output = formatDirectivesInSchema(input);
      expect(output).toBe('type S = "/// @omitDefault";');
    });

    it("does not modify '///' inside single-quoted string literals", () => {
      const input = "type S = '/// @omitDefault';";
      const output = formatDirectivesInSchema(input);
      expect(output).toBe("type S = '/// @omitDefault';");
    });

    it("does not modify '///' inside template literals", () => {
      const input = "type S = `/// @omitDefault`;";
      const output = formatDirectivesInSchema(input);
      expect(output).toBe("type S = `/// @omitDefault`;");
    });

    it("does not modify '///' inside block comments", () => {
      const input = "/*\n  /// @omitDefault\n*/\nbar: string;";
      const output = formatDirectivesInSchema(input);
      expect(output).toBe("/*\n  /// @omitDefault\n*/\nbar: string;");
    });

    it("does not modify regular '//' comments", () => {
      const input = "foo: string; // normal comment\nbar: string;";
      const output = formatDirectivesInSchema(input);
      expect(output).toBe("foo: string; // normal comment\nbar: string;");
    });

    it("does not modify regular '//' comments containing '///' (e.g. '// ///')", () => {
      const input = "foo: string; // /// not a directive\nbar: string;";
      const output = formatDirectivesInSchema(input);
      expect(output).toBe("foo: string; // /// not a directive\nbar: string;");
    });
  });
});
