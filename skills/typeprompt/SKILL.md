---
name: typeprompt
description: Author, format, compile, test, and integrate TypePrompt (.tp) prompt templates, schemas, tools, playground files (.play.tp), and typeprompt.yaml configuration across TypeScript, Python, Kotlin, Rust, C++, Swift, Dart, and C#. Use whenever working with .tp files, typeprompt.yaml, bunx @typeprompt/cli, or generated TypePrompt code.
---

# TypePrompt

TypePrompt compiles `.tp` XML prompt templates (with TypeScript-based schemas, tools, snippets, and YAML few-shot examples) into type-safe native code for 8 languages. It does **not** make LLM calls itself — you render prompts with the generated API, send them via your own generic `executePrompt` helper wrapping any LLM SDK, and parse responses with `parseResponse`.

Full docs index for LLMs: `https://typeprompt.dev/llms.txt` (single file: `https://typeprompt.dev/llms-full.txt`).

## Project layout & file naming

- `typeprompt.yaml` at project root (`include: [prompts/**/*.tp]`, plus `gen:` entries per target language).
- File names must match their root element name:
  - `<template name="Translate">` → `Translate.tp` (`PascalCase`)
  - `<tool name="webSearch">` → `webSearch.tp` (`camelCase`)
  - `<namespace name="Legal">` → `Legal/shared.tp` (or any `.tp` in that namespace folder)
  - `<meta>` (top-level `Meta` type declaration) → `meta.tp`
  - `<playground for="Translate">` → `Translate.play.tp`

## Template syntax (`.tp`)

```xml
<template name="DecodeCatMood">
  <meta>
    model: gpt-4o
    temperature: 0.2
  </meta>

  <schema>
    interface Input {
      catAction: string;
      bowlStatus: "empty" | "half-empty";
    }

    interface Output {
      demand: "feed-me" | "kneel" | "chaos";
      /** What the human servant must immediately do. */
      humanAction: string;
    }
  </schema>

  <system>
    Decode <c>catAction</c> into its true <c>demand</c>.
  </system>

  <user>
    <insert val="input" format="yaml" />
  </user>

  <examples>
    - input:
        catAction: Yowl at 3am
        bowlStatus: half-empty
      output:
        demand: feed-me
        humanAction: Shake the bowl to cover the bottom.
  </examples>
</template>
```

### Key template elements & inline tags

- `<meta>` (inside `<template>`): Required if a top-level `<meta>` exists; YAML matching `Meta`.
- `<schema>`: Required. Must declare both `Input` and `Output`. `Output` must be either `string` (plain text response) or an `interface`/object type (structured JSON response).
- `<tools>`: Optional list of `<tool name="myTool" />` referencing top-level `<tool>` definitions in the same namespace.
- `<system>` and `<user>`: Required (unless provided per `<variant>`). Leading base indentation is stripped automatically; lines less indented than the first non-empty line are a compile error.
- `<insert val="input.foo" format="yaml" />`: Inserts a value rooted at `input` (or `it` inside conditional snippets). `format` is optional for `string`/`integer` (defaults to `text`); required otherwise: `json`, `yaml`, `toon`, `csv`, `tsv` (`csv`/`tsv` require array of objects with `string`/`integer` fields).
- `<insert snippet="mySnippet" />`: Inserts a `<snippet name="mySnippet">` (supports `if="..." is="true|notNull|notEmpty"` with `<then>`/`<else>`, or `switch="..."` with `<on case="...">`).
- `<insert schema="Output" format="typescript" />`: Injects the TypeScript definition of `Output` (only valid when `Output` is structured, not `string`; mainly for models without native JSON Schema support).
- `<enclosed tag="Document">...</enclosed>`: Emits `<Document>...</Document>` without XML escaping; `<insert>` inside preserves indentation.
- `<c>fieldName</c>` or `<c>{"field": "val"}</c>`: Compile-time checked reference to schema field names, string literals, tool names, or inline JSON examples.
- `<examples>`: YAML list of `{ input, steps?, output }` validated against `Input`, tool schemas, and `Output`.
- `<variant case="...">`: Specializes `<system>`, `<user>`, and/or `<examples>` when `Input` has a `variant` string-literal union field.

## Schema language (SDL) rules & gotchas

Subset of TypeScript with one addition: `integer` (32-bit int; `number` is 64-bit float).

- Primitives: `string`, `number`, `integer`, `boolean`.
- Declarations: `interface Foo { ... }` and `type Foo = { ... }` are equivalent.
- Naming: Type names `[A-Z][A-Za-z0-9]*` (no `_`); field names `[a-z][A-Za-z0-9]*` (no `_`); string literals `[A-Za-z][A-Za-z0-9._/-]*` (must start with a letter). Names are case-insensitively unique.
- Optional fields: `foo?: string;` (not `string | null`).
- Unions must be **homogeneous**:
  - String-literal union: `"a" | "b"`
  - Discriminated interface union: every member non-empty, **first field** is the shared discriminator with a string literal or boolean literal (`true`/`false`) type.
- Recursive types: allowed only through a discriminated union whose **first member** is non-recursive (base case).
- Shared namespace types: reference as `shared.TypeName` inside template/tool schemas.
- JSDoc `/** ... */` is preserved in JSON Schemas and generated code; `//` and `/* */` are stripped.
- `/// @omitDefault` on a field omits it during serialization when it holds its default (`null`, `[]`, `""`, `false`, `0`).

## Playground files (`.play.tp`)

```xml
<playground for="DecodeCatMood">
  <model>
    model: openai/gpt-4o
    temperature: 0.2
  </model>

  <samples>
  - name: "Keyboard sit"
    input:
      catAction: "Sit on keyboard"
      bowlStatus: "half-empty"
  </samples>
</playground>
```

API keys live in `.typeprompt.secrets.yaml` (gitignored).

## CLI workflow

Always run `gen` (and `format`) after editing `.tp` files to validate schemas, examples, and regenerate code:

```bash
bunx @typeprompt/cli init                     # Scaffold typeprompt.yaml + prompts/
bunx @typeprompt/cli gen                      # Compile & generate code (--watch / -w)
bunx @typeprompt/cli format                   # Format .tp files (--ci to check only)
bunx @typeprompt/cli run prompts/Foo.play.tp  # Run playground samples (-o out.json)
bunx @typeprompt/cli patch -b <base> -o <dir> # Create a template-override patch project
```

Pass `-p <dir>` to target a project directory other than cwd.

## Integrating generated code

Write **one** generic `executePrompt` helper per project wrapping your LLM SDK (OpenAI, Anthropic, Gemini, etc.) that reads `prompt.systemMessage`, `prompt.userMessage`, `prompt.examples`, `prompt.tools`, `prompt.outputFormat`, and `prompt.meta`, executes tool calls via `prompt.executeTools(...)`, and returns `prompt.parseResponse(rawContent)`.

For full language-specific APIs and end-to-end `executePrompt` examples, fetch the relevant guide:
- `https://typeprompt.dev/languages/typescript.md`
- `https://typeprompt.dev/languages/python.md`
- `https://typeprompt.dev/languages/kotlin.md`
- `https://typeprompt.dev/languages/rust.md`
- `https://typeprompt.dev/languages/cpp.md`
- `https://typeprompt.dev/languages/swift.md`
- `https://typeprompt.dev/languages/dart.md`
- `https://typeprompt.dev/languages/csharp.md`
