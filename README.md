<br />
<img src="packages/website/public/favicon.svg" width="80" alt="TypePrompt" />

# TypePrompt

[Website](https://typeprompt.dev)

**TypePrompt** is a tool for managing LLM prompts in your codebase. It brings end-to-end type safety to your AI workflow through code generation, and integrates seamlessly with any LLM SDK.

You write prompt templates in a simple XML format, along with few-shot examples, tools, and schemas (written in a subset of TypeScript). TypePrompt transpiles them into native code for your target language.

### End-to-end type safety

- **At template resolution time**: TypePrompt guarantees that the values you pass match the input placeholders expected by the template.
- **At response processing time**: TypePrompt guarantees that the typed objects your application uses to represent the LLM's response match the schema passed to the model.

### Supported languages

TypeScript, Python, Kotlin, Rust, C++, Swift, Dart, C# (*more languages to come*).

---

## Example prompt template

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

In your application code:

```kotlin
// MyApp.kt

import ai.myapp.generated.prompts.prompts
import ai.myapp.generated.prompts.Schema.DecodeCatMood

// 1. Resolve the prompt template with typed input
val prompt = prompts.renderDecodeCatMood(
    DecodeCatMood.Input(
        catAction = "Sit on keyboard",
        bowlStatus = DecodeCatMood.Input_BowlStatus.HalfEmpty,
    )
)

// 2. Send prompt to LLM using your preferred SDK.
// The prompt provides system and user messages, tools,
// few-shot examples, and the response's JSON Schema.

// 3. Parse the LLM response into strongly-typed output
val result = prompt.parseResponse(rawResponse)
println(result.humanAction)
// "Surrender warm laptop and apologize for trying to work."
```

[See more examples →](examples)

---

## Features

- **Lightweight prompt management**: Organize prompts in dedicated template files instead of hardcoding strings in application code, without locking you into a heavyweight framework.
- **End-to-end type safety**: Enforces compile-time type safety across every stage of the LLM lifecycle: resolving template placeholders, parsing model responses, and dispatching tool calls.
- **TypeScript-based SDL**: Define schemas with familiar TypeScript types and generate standard JSON Schemas (OpenAI, Gemini, Anthropic).
- **Validated few-shot examples**: Author few-shot examples in YAML that are validated against your schemas and automatically formatted with your user instructions.
- **Prompt variants & overrides**: Author multiple prompt versions sharing identical schemas for A/B testing, and dynamically inject template overrides at runtime for rapid experimentation and prompt tuning.
- **Flexible input formatting**: Format complex input types using JSON, YAML, CSV, or [TOON](https://toonformat.dev) without changing application code.
- **Custom structured metadata (`<meta>`)**: Define your own `Meta` schema to attach typed configuration (e.g., model, temperature, routing tags) to each template, tailored to any LLM SDK.
- **Developer experience & tooling**: Official VS Code extension, standalone Language Server (`npx @typeprompt/language-server`), CLI watch mode, and built-in template formatter (`npx typeprompt format`).

---

## Getting started

1. **Initialize your project**: Run `npx typeprompt init` in your project root.
2. **Configure target languages**: Edit `typeprompt.yaml` to specify your target language.
3. **Generate code**: Run `npx typeprompt gen`, or pass `--watch` for automatic regeneration on file changes.

---

## Comparison with other tools

TypePrompt shares many similarities with [DotPrompt](https://github.com/google/dotprompt), but introduces **end-to-end type safety**. Tools like DotPrompt, LangChain, Semantic Kernel, and Promptfoo parse templates dynamically at runtime, allowing application types to drift from prompt definitions. TypePrompt eliminates this risk by treating your prompt schemas as the source of truth and transpiling them into native code at build time.

---

## Documentation

### Core concepts

- **[Language reference](https://typeprompt.dev/reference)** — XML syntax for defining prompt templates, tools, metadata.
- **[Schema language](https://typeprompt.dev/schema)** — TypeScript subset for defining `Input` and `Output` types.

### Integration guides

- [TypeScript](https://typeprompt.dev/languages/typescript)
- [Python](https://typeprompt.dev/languages/python)
- [Kotlin](https://typeprompt.dev/languages/kotlin)
- [Rust](https://typeprompt.dev/languages/rust)
- [C++](https://typeprompt.dev/languages/cpp)
- [Swift](https://typeprompt.dev/languages/swift)
- [Dart](https://typeprompt.dev/languages/dart)
- [C#](https://typeprompt.dev/languages/csharp)

### Advanced workflows

- **[Prompt refinement](https://typeprompt.dev/template-overrides)** — Iterating on prompts using template overrides.
