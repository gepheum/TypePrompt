# TypePrompt

**TypePrompt** is a tool for managing LLM prompts in your codebase. It brings end-to-end type safety to your AI workflow through code generation, and integrates seamlessly with any LLM SDK.

You write prompt templates in a simple XML format, along with few-shot examples, tools, and schemas (written in a subset of TypeScript). TypePrompt transpiles them into native code for your target language.

### End-to-End Type Safety

- **At template resolution time**: TypePrompt guarantees that the values you pass match the input placeholders expected by the template.
- **At response processing time**: TypePrompt guarantees that the typed objects your application uses to represent the LLM's response match the schema passed to the model.

### Supported Languages

TypeScript, Python, Kotlin, Rust, Swift, Dart, C# (*more languages to come*).

---

## Example Prompt Template

```xml
<template name="DecodeCatMood">
  <meta>
    model: gpt-4o
    temperature: 0.2
  </meta>

  <schema>
    interface Input {
      action: "stare" | "yowl-at-3am" | "knock-glass";
      bowlStatus: "empty" | "half-full";
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
        action: yowl-at-3am
        bowlStatus: half-full
      output:
        demand: feed-me
        urgency: crisis
        humanAction: "Shake the bowl to cover the bottom."

    - input:
        action: knock-glass
        bowlStatus: empty
      output:
        demand: kneel
        urgency: crisis
        humanAction: "Apologize and refill the bowl."
  </examples>
</template>
```

---

## Features

- **End-to-End Type Safety**: Compile-time validation for template input placeholders and strongly-typed LLM response parsing.
- **TypeScript-Based SDL**: Define schemas using familiar TypeScript interfaces and unions.
- **Strict JSON Schema Generation**: Automatically generates JSON Schemas compliant with OpenAI Structured Outputs, Gemini, and Anthropic.
- **Flexible Input Formatting**: Format complex input types using JSON, YAML, CSV or [TOON](https://toonformat.dev), and easily switch between formats without changing application code.
- **Schema-Checked Instructions (`<c>`)**: Verifies that fields, enums, and sample JSON referenced in your prompt instructions actually match your schema.
- **Validated Few-Shot Examples**: Author few-shot examples in YAML that are validated against your input and output schemas at compile time.
- **Prompt Variants**: Author multiple versions of a prompt with identical input and output types, and easily pick the desired variant at runtime.
- **Typed Tool Calling**: Declare tools with typed inputs and outputs, and generate type-safe dispatchers.
- **Custom Structured Metadata (`<meta>`)**: Define your own `Meta` schema to attach typed configuration (e.g., model, temperature, routing tags) to each template, tailored to any LLM SDK.
- **Zero Framework Lock-in**: Generates lightweight native code that integrates with any LLM SDK or custom client.
- **Fast Developer Workflow**: CLI with watch mode (`npx typeprompt gen --watch`) and built-in template formatter (`npx typeprompt format`).

---

## Getting Started

1. **Initialize your project**: Run `npx typeprompt init` in your project root.
2. **Configure target languages**: Edit `typeprompt.yml` to specify your target language.
3. **Generate code**: Run `npx typeprompt gen`, or pass `--watch` for automatic regeneration on file changes.

---

## Comparison with Other Tools

TypePrompt is conceptually inspired by tools like [DotPrompt](https://github.com/google/dotprompt), but introduces **end-to-end type safety**.

In DotPrompt, LangChain, Semantic Kernel, and Promptfoo, prompt templates are parsed dynamically at runtime. There is no compile-time guarantee that the parameters you pass match the placeholders in your template, or that the response types in your application match the schema sent to the LLM.

TypePrompt eliminates this class of runtime errors by generating native code at build time. Your compiler ensures complete type safety from template inputs to structured LLM outputs, without locking you into a heavyweight framework.

---

## Documentation

### Core Reference
- **[Template Syntax](docs/spec.md)** — XML syntax for `<template>`, `<tool>`, `<meta>`, `<namespace>`.
- **[Schema Language](docs/schema.md)** — TypeScript-subset SDL used to define input and output types for templates and tools.

### Language Guides
- [TypeScript](docs/languages/typescript.md)
- [Python](docs/languages/python.md)
- [Kotlin](docs/languages/kotlin.md)
- [Rust](docs/languages/rust.md)
- [Swift](docs/languages/swift.md)
- [Dart](docs/languages/dart.md)
- [C#](docs/languages/csharp.md)
