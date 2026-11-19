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

In practice, this rules out bugs that other approaches only catch at runtime, if at all:

- **Mismatched placeholders.** With runtime prompt files (Dotprompt, Prompty) or framework templates (LangChain, Semantic Kernel), renaming a variable on one side and not the other fails at runtime, or silently sends an incomplete prompt.
- **Output types written twice.** When the schema lives in the prompt file and the type lives in your code, nothing keeps the two in sync.
- **Stale few-shot examples.** Examples are usually hand-written text that no tool checks. After a schema change, they keep teaching the model the old shape.

[BAML](https://boundaryml.com) also generates types from prompt files. The main differences: TypePrompt checks few-shot examples, doesn't make the LLM call itself, and uses TypeScript type syntax instead of a custom language.
