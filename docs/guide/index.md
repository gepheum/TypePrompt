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

TypePrompt shares many similarities with [DotPrompt](https://github.com/google/dotprompt), but introduces **end-to-end type safety**. Tools like DotPrompt, LangChain, Semantic Kernel, and Promptfoo parse templates dynamically at runtime, allowing application types to drift from prompt definitions. TypePrompt eliminates this risk by treating your prompt schemas as the source of truth and transpiling them into native code at build time.
