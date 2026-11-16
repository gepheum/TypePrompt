---
title: Examples
description: Self-contained TypePrompt examples, from basic text generation to tool calling and namespaces.
---

# Examples

The [`examples/`](https://github.com/gepheum/typeprompt/tree/main/examples) directory in the repository contains self-contained TypePrompt projects demonstrating specific features, from basic text generation to advanced tool calling and namespaced schemas.

## Example projects

| Directory | Description | Key features |
|---|---|---|
| [01-basics](https://github.com/gepheum/typeprompt/tree/main/examples/01-basics) | Getting started with basic text generation | Simple prompt template with text output and few-shot examples |
| [02-complex-types](https://github.com/gepheum/typeprompt/tree/main/examples/02-complex-types) | Complex input and output types | `<meta>`, structured object output, recursive discriminated unions (`PageNode`), TOON-formatted input (`format="toon"`), YAML-formatted input (`format="yaml"`) |
| [03-tools](https://github.com/gepheum/typeprompt/tree/main/examples/03-tools) | Typed tool definitions and multi-step execution | `<tool>`, `<tools>` registration, few-shot examples with intermediate tool calls |
| [04-variants](https://github.com/gepheum/typeprompt/tree/main/examples/04-variants) | Multiple prompt variations sharing schemas | `<variant>`, per-variant system prompts and few-shot examples, runtime selection via `Input.variant` |
| [05-conditional-logic](https://github.com/gepheum/typeprompt/tree/main/examples/05-conditional-logic) | Modular text composition and conditional logic | `<snippet>`, conditional snippets (`if`/`then`/`else`), `switch` snippets, `<insert snippet="...">` |
| [06-shared-types](https://github.com/gepheum/typeprompt/tree/main/examples/06-shared-types) | Reusable types in the default namespace | `<namespace name="Main">`, shared types referenced via `shared.TypeName` |
| [07-namespaces](https://github.com/gepheum/typeprompt/tree/main/examples/07-namespaces) | Multi-namespace project organization | Named namespaces (`Finance`, `Legal`), isolated shared types, domain-specific tools and templates |

## End-to-end applications

| Directory | Description | Stack |
|---|---|---|
| [e2e-kotlin](https://github.com/gepheum/typeprompt/tree/main/examples/e2e-kotlin) | Runnable CLI translation tool with structured JSON output calling OpenAI | Kotlin, Gradle, OpenAI Java SDK |
| [e2e-python](https://github.com/gepheum/typeprompt/tree/main/examples/e2e-python) | Runnable city day-planner with weather tool and structured JSON output calling Claude | Python, Anthropic Python SDK |
| [e2e-rust](https://github.com/gepheum/typeprompt/tree/main/examples/e2e-rust) | Runnable SRE incident commander with service metrics tool and structured JSON output calling Google Gemini | Rust, Cargo, Google Gemini API |
