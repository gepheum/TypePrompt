# TypePrompt

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
<template name="DecodeCatMood">
  <meta>
    model: gpt-4o
    temperature: 0.2
  </meta>

  <schema>
    interface Input {
      action: string;
      bowlStatus: "empty" | "half-empty";
    }

    interface Output {
      demand: "feed-me" | "kneel" | "chaos";
      urgency: "chill" | "crisis";
      humanAction: string;
    }
  </schema>

  <system>
    You are an expert feline behavior interpreter.
    Decode cat actions into their true demands.
  </system>

  <user>
    Action: <insert val="input.action" />
    Food bowl: <insert val="input.bowlStatus" />
  </user>

  <examples>
    - input:
        action: "Yowl at 3am"
        bowlStatus: half-full
      output:
        demand: feed-me
        urgency: crisis
        humanAction: "Shake the bowl to cover the bottom."

    - input:
        action: "Knock glass"
        bowlStatus: empty
      output:
        demand: kneel
        urgency: crisis
        humanAction: "Apologize and refill the bowl."
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
        action = "Knock glass",
        bowlStatus = DecodeCatMood.Input_BowlStatus.Empty,
    )
)

// ... send prompt to LLM ...

// 2. Parse the LLM response into strongly-typed output
val result = prompt.parseResponse(rawResponse)
println(result.humanAction)
```

[See more examples →](examples)

---

## Features

- **Lightweight prompt management**: Organize prompts in dedicated template files instead of hardcoding strings in application code, without locking you into a heavyweight framework.
- **End-to-end type safety**: Enforces compile-time type safety across every stage of the LLM lifecycle: resolving template placeholders, parsing model responses, and dispatching tool calls.
- **TypeScript-based SDL**: Define schemas with familiar TypeScript types and generate standard JSON Schemas (OpenAI, Gemini, Anthropic).
- **Validated few-shot examples**: Author few-shot examples in YAML that are validated against your schemas and automatically formatted with your user instructions.
- **Prompt variants & template overrides**: Author multiple prompt versions sharing identical schemas for A/B testing, and dynamically inject template overrides at runtime for rapid experimentation and prompt tuning.
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

- **[Language reference](docs/reference.md)** — XML syntax for defining prompt templates, tools, metadata.
- **[Schema language](docs/schema.md)** — TypeScript subset for defining `Input` and `Output` types.

### Integration guides

- [TypeScript](docs/languages/typescript.md)
- [Python](docs/languages/python.md)
- [Kotlin](docs/languages/kotlin.md)
- [Rust](docs/languages/rust.md)
- [C++](docs/languages/cpp.md)
- [Swift](docs/languages/swift.md)
- [Dart](docs/languages/dart.md)
- [C#](docs/languages/csharp.md)

### Advanced workflows

- **[Prompt refinement](docs/template-overrides.md)** — Iterating on prompts using template overrides.
