---
title: Introduction
description: What TypePrompt is, and why it exists.
---

# Introduction

**TypePrompt** is a tool for managing LLM prompts in your codebase. It brings end-to-end type safety to your AI workflow through code generation, and integrates with any LLM SDK.

You write prompt templates in a simple XML format, along with few-shot examples, tools, and schemas (written in a subset of TypeScript). TypePrompt transpiles them into native code for your target language.

## End-to-end type safety

- **At template resolution time**: TypePrompt guarantees that the values you pass match the input placeholders expected by the template.
- **At response processing time**: TypePrompt guarantees that the typed objects your application uses to represent the LLM's response match the schema passed to the model.

## Supported languages

TypeScript, Python, Kotlin, Rust, C++, Swift, Dart, C# (*more languages to come*).

## Features

- **[Prompt templates](/reference)**: Bundle instructions, schemas, tools, and few-shot examples in dedicated `.tp` files. Few-shot examples are validated against your schemas.
- **[TypeScript-based schemas](/schema)**: Define types with familiar TypeScript syntax. TypePrompt generates native types and standard JSON Schemas for all major LLM providers.
- **[Flexible input formatting](/reference#insert)**: Render complex inputs as JSON, YAML, CSV, or [TOON](https://toonformat.dev) without changing application code.
- **[Custom metadata](/reference#the-meta-element-top-level)**: Define your own `Meta` type to attach typed configuration (model, temperature, routing tags) to each template.
- **[Variants](/reference#variant) and [template overrides](/template-overrides)**: Author prompt versions that share schemas for A/B testing, or inject overrides at runtime for rapid experimentation.
- **[Playground inference](/playground)**: Run templates against any LLM from VS Code or the command line.
- **Tooling**: VS Code extension, standalone Language Server (`npx @typeprompt/language-server`), watch mode, and a built-in formatter. See [CLI and configuration](/cli).

## Comparison with other tools

TypePrompt gets its type safety from code generation. The schemas in your template files are the source of truth: TypePrompt translates them into native types in your application's language. The code that fills in a template and the code that reads the model's response are generated from the same definition as the prompt itself, so they can't drift apart. If they do, your compiler or type checker reports it.

TypePrompt is not an LLM client, and doesn't wrap one. It only renders prompts and parses responses. You send the request with whichever SDK you already use.

| | Prompt and schemas | Template inputs | Response types | Few-shot examples | Calls the model |
|---|---|---|---|---|---|
| **Strings in code + structured outputs**<br>(OpenAI SDK, Instructor, Vercel AI SDK) | Scattered across application code | Plain string interpolation | Defined in code, separately from the prompt | Hand-written, not checked | Yes |
| **Frameworks**<br>(LangChain, Semantic Kernel) | In code or template files | Untyped variables, filled in at runtime | Defined in code, separately from the prompt | Plain data, not checked against the schemas | Yes, through the framework |
| **Prompt files rendered at runtime**<br>(Dotprompt, Prompty) | Together in prompt files | Checked at runtime | Checked at runtime | Written into the prompt, not checked against the schemas | Yes, through their runtime |
| **BAML** | Together in prompt files (custom language) | Generated types | Generated types | Written into the prompt, not checked against the schemas | Yes, through its own runtime |
| **TypePrompt** | Together in prompt files (XML + TypeScript-style schemas) | Generated types | Generated types | Checked against the schemas at build time | No: use any LLM SDK |
