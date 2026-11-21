<br />
<img src="packages/website/public/favicon.svg" width="80" alt="TypePrompt" />

# TypePrompt

**End-to-end type safety for LLM prompts.**

[Website](https://typeprompt.dev) · [Docs](https://typeprompt.dev/introduction) · [Quick Start](https://typeprompt.dev/quick-start) · [VS Code Extension](https://marketplace.visualstudio.com/items?itemName=gepheum.typeprompt-vscode) · [Examples](examples)

Write prompt templates with schemas, tools, and few-shot examples in dedicated `.tp` files. TypePrompt compiles them into a type-safe API for your target language — with zero framework lock-in, ready to drop into whatever LLM SDK you already use.

**Supported languages:** TypeScript, Python, Kotlin, Rust, C++, Swift, Dart, C#

---

## See it in action

Prompt templates are plain XML files that bring together prompt instructions, typed schemas, tools, and few-shot examples into a single source of truth:

```xml
<!-- DecodeCatMood.tp -->

<template name="DecodeCatMood">
  <meta>
    model: gpt-4o
    temperature: 0.2
  </meta>

  <schema>
    // Variables provided to render the prompt
    interface Input {
      catAction: string;
      bowlStatus: "empty" | "half-empty";
    }

    // Structured JSON response expected from the model
    interface Output {
      demand: "feed-me" | "kneel" | "chaos";
      urgency: "chill" | "crisis";
      /** What the human servant must immediately do. */
      humanAction: string;
    }
  </schema>

  <system>
    You are an expert feline behavior interpreter.
    Decode cat actions into their true demands.
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
        urgency: crisis
        humanAction: Shake the bowl to cover the bottom.
  </examples>
</template>
```

`npx @typeprompt/cli gen` compiles your templates into a type-safe API in your target language. Here's how you use it in TypeScript:

```typescript
// MyApp.ts

import { prompts } from "./gen/prompts.js";
import { executePrompt } from "./llm.js";

// 1. Render the prompt template with strongly-typed input
const prompt = prompts.decodeCatMood.render({
  catAction: "Sit on keyboard",
  bowlStatus: "half-empty",
});

// 2. Send it via your own generic helper wrapping any LLM SDK.
// It forwards the rendered messages, tools, examples, and JSON Schema,
// calls prompt.parseResponse(...), and returns the strongly-typed output.
const result = await executePrompt(prompt);

console.log(result.humanAction);
// "Surrender warm laptop and apologize for trying to work."
```

If your application code and your templates drift apart, your compiler or type checker catches it — not at runtime, in production, after the model replies.

[See more examples →](examples)

---

## Features

**Authoring**

- **[TypeScript-based schemas](https://typeprompt.dev/schema)**: Define types with familiar TypeScript syntax. TypePrompt generates native types and standard JSON Schemas for all major LLM providers.
- **[Few-shot examples](https://typeprompt.dev/reference#examples)**: Write examples in YAML, checked against your schemas at build time and automatically formatted using your user instructions.
- **[Flexible input formatting](https://typeprompt.dev/reference#insert)**: Render complex inputs as JSON, YAML, CSV, or [TOON](https://toonformat.dev) without changing application code.
- **[Checked inline references (`<c>`)](https://typeprompt.dev/reference#c)**: Wrap field names, tool names, or inline JSON examples in `<c>` to verify them against your schemas at compile time so your instructions stay in sync with your types.
- **[Snippets and conditional logic](https://typeprompt.dev/reference#snippet)**: Compose prompts from modular text fragments, and branch content on input values with `if` and `switch` snippets.
- **[Custom metadata](https://typeprompt.dev/reference#the-meta-element-top-level)**: Define your own `Meta` type to attach typed configuration (model, temperature, routing tags, or anything else your application needs) to each template.

**Experimentation**

- **[Variants](https://typeprompt.dev/reference#variant)**: Author prompt versions that share the same schemas, and pick one at runtime for A/B testing.
- **[Template overrides](https://typeprompt.dev/template-overrides)**: Inject modified templates at runtime, without rebuilding or redeploying, for fast iteration and evaluations.
- **[Playground](https://typeprompt.dev/playground)**: Save sample inputs in files alongside your templates, and run them against any LLM from your IDE or the CLI.

**Tooling**

- **[CLI](https://typeprompt.dev/cli)**: Code generation, watch mode, and a built-in formatter.
- **Editor support**: [VS Code extension](https://marketplace.visualstudio.com/items?itemName=gepheum.typeprompt-vscode) and a standalone Language Server (`npx @typeprompt/language-server`).

---

## Getting started

1. **Initialize your project**: Run `npx @typeprompt/cli init` in your project root.
2. **Configure target languages**: Edit `typeprompt.yaml` to specify your target language.
3. **Generate code**: Run `npx @typeprompt/cli gen`, or pass `--watch` for automatic regeneration on file changes.

See the [Quick start guide](https://typeprompt.dev/quick-start) for a full walkthrough.

**Using an AI coding agent?** Install the TypePrompt skill so your agent (Claude Code, Cursor, Codex, etc.) knows the `.tp` syntax and CLI:

```bash
npx skills add gepheum/typeprompt
```

---

## Comparison with other tools

TypePrompt gets its type safety from code generation. The schemas in your template files are the source of truth: TypePrompt translates them into native types in your application's language. The code that fills in a template and the code that reads the model's response are generated from the same definition as the prompt itself, so they can't drift apart.

TypePrompt is not an LLM client, and doesn't wrap one. It only renders prompts and parses responses. You send the request with whichever SDK you already use.

In practice, this rules out bugs that other approaches only catch at runtime, if at all:

- **Mismatched placeholders.** With runtime prompt files (Dotprompt, Prompty) or framework templates (LangChain, Semantic Kernel), renaming a variable on one side and not the other fails at runtime, or silently sends an incomplete prompt.
- **Output types written twice.** When the schema lives in the prompt file and the type lives in your code, nothing keeps the two in sync.
- **Stale few-shot examples.** Examples are usually hand-written text that no tool checks. After a schema change, they keep teaching the model the old shape.

[BAML](https://boundaryml.com) also generates types from prompt files. The main differences: TypePrompt checks few-shot examples, doesn't make the LLM call itself, and uses TypeScript type syntax instead of a custom language.

---

## Documentation

### Getting started

- **[Introduction](https://typeprompt.dev/introduction)** — What TypePrompt is, and why it exists.
- **[Quick start](https://typeprompt.dev/quick-start)** — Set up TypePrompt and generate your first typed prompt.
- **[Project structure](https://typeprompt.dev/project-structure)** — How TypePrompt projects and `.tp` files are organized.

### Reference

- **[Template syntax](https://typeprompt.dev/reference)** — XML syntax for defining prompt templates, tools, and metadata.
- **[Schema language](https://typeprompt.dev/schema)** — TypeScript subset for defining `Input`, `Output`, and tool types.
- **[CLI and configuration](https://typeprompt.dev/cli)** — CLI commands and `typeprompt.yaml` options.

### Prompt iteration

- **[Playground inference](https://typeprompt.dev/playground)** — Run prompt templates against real LLMs from VS Code or the CLI.
- **[Template overrides](https://typeprompt.dev/template-overrides)** — Rapid prompt iteration and tuning using template overrides.

### Language guides

- [TypeScript](https://typeprompt.dev/languages/typescript) · [Python](https://typeprompt.dev/languages/python) · [Kotlin](https://typeprompt.dev/languages/kotlin) · [Rust](https://typeprompt.dev/languages/rust) · [C++](https://typeprompt.dev/languages/cpp) · [Swift](https://typeprompt.dev/languages/swift) · [Dart](https://typeprompt.dev/languages/dart) · [C#](https://typeprompt.dev/languages/csharp)

---

## License

Released under the [MIT License](LICENSE).
