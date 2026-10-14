---
title: Introduction
description: What TypePrompt is, and why it exists.
---

# Introduction

**TypePrompt** is a tool for managing LLM prompts in your codebase. It brings end-to-end type safety to your AI workflow through code generation, and integrates seamlessly with any LLM SDK.

You write prompt templates in a simple XML format, along with few-shot examples, tools, and schemas (written in a subset of TypeScript). TypePrompt transpiles them into native code for your target language.

## End-to-end type safety

- **At template resolution time**: TypePrompt guarantees that the values you pass match the input placeholders expected by the template.
- **At response processing time**: TypePrompt guarantees that the typed objects your application uses to represent the LLM's response match the schema passed to the model.

## Supported languages

TypeScript, Python, Kotlin, Rust, C++, Swift, Dart, C# (*more languages to come*).

## Features

- **Lightweight prompt management**: Organize prompts in dedicated template files instead of hardcoding strings in application code, without locking you into a heavyweight framework.
- **End-to-end type safety**: Enforces compile-time type safety across every stage of the LLM lifecycle: resolving template placeholders, parsing model responses, and dispatching tool calls.
- **TypeScript-based SDL**: Define schemas with familiar TypeScript types and generate standard JSON Schemas (OpenAI, Gemini, Anthropic).
- **Validated few-shot examples**: Author few-shot examples in YAML that are validated against your input and output schemas at compile time.
- **Prompt variants & [template overrides](/guide/template-overrides)**: Author multiple prompt versions sharing identical schemas for A/B testing, and dynamically inject template overrides at runtime for rapid experimentation and prompt tuning.
- **Flexible input formatting**: Format complex input types using JSON, YAML, CSV, or [TOON](https://toonformat.dev) without changing application code.
- **Custom structured metadata (`<meta>`)**: Define your own `Meta` schema to attach typed configuration (e.g., model, temperature, routing tags) to each template, tailored to any LLM SDK.
- **Developer experience & tooling**: Official VS Code extension, standalone Language Server (`npx @typeprompt/language-server`), CLI watch mode, and built-in template formatter (`npx typeprompt format`).

## Comparison with other tools

TypePrompt shares many similarities with [DotPrompt](https://github.com/google/dotprompt), but introduces **end-to-end type safety**. Tools like DotPrompt, LangChain, Semantic Kernel, and Promptfoo parse templates dynamically at runtime, allowing application types to drift from prompt definitions. TypePrompt eliminates this risk by treating your prompt schemas as the source of truth and transpiling them into native code at build time.

## Getting started

### 1. Initialize your project

Run the init command in your project root:

```bash
npx typeprompt init
```

This scaffolds a `typeprompt.yml` configuration file and a `prompts/` directory containing a starter template.

### 2. Configure target languages

Edit `typeprompt.yml` to specify where generated code should be written, for each language you target. For example, to generate TypeScript and Kotlin:

```yaml
gen:
  typescript:
    file: src/gen/prompts.ts
  kotlin:
    file: src/main/kotlin/gen/Prompts.kt
    package: com.example.prompts
```

See the language guide for your target (TypeScript, Python, Kotlin, Rust, C++, Swift, Dart, or C#) in the **Languages** menu above for the exact options and runtime dependencies.

### 3. Write a template

Create an `.xml` file under `prompts/` describing your template's schema, instructions, and few-shot examples. See the [language reference](/reference) for the full XML syntax and the [schema language](/schema) for the type system.

### 4. Generate code

```bash
npx typeprompt gen
```

Pass `--watch` to regenerate automatically as you edit your templates:

```bash
npx typeprompt gen --watch
```

The generated code exposes a `prompts` object with one typed `render` method per template. Render it with typed input, send the result to your LLM, then parse the response back into a typed object — see the guide for your language for the exact API.

