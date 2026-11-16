# Examples

This directory contains self-contained TypePrompt examples demonstrating various features, from basic text generation to advanced tool calling and namespaced schemas.

---

## Example Projects

| Directory | Description | Key Features |
|---|---|---|
| **[01-basics](01-basics)** | Getting started with basic text generation | Simple prompt template with text output and few-shot examples |
| **[02-complex-types](02-complex-types)** | Complex input and output types | `<meta>`, structured object output, recursive discriminated unions (`PageNode`), TOON-formatted input (`format="toon"`), YAML-formatted input (`format="yaml"`) |
| **[03-tools](03-tools)** | Typed tool definitions and multi-step execution | `<tool>`, `<tools>` registration, few-shot examples with intermediate tool calls |
| **[04-variants](04-variants)** | Multiple prompt variations sharing schemas | `<variant>`, per-variant system prompts and few-shot examples, runtime selection via `Input.variant` |
| **[05-conditional-logic](05-conditional-logic)** | Modular text composition and conditional logic | `<snippet>`, conditional snippets (`if`/`then`/`else`), `switch` snippets, `<insert snippet="...">` |
| **[06-shared-types](06-shared-types)** | Reusable types in the default namespace | `<namespace name="Main">`, shared types referenced via `shared.TypeName` |
| **[07-namespaces](07-namespaces)** | Multi-namespace project organization | Named namespaces (`Finance`, `Legal`), isolated shared types, domain-specific tools and templates |

---

## End-to-End Applications

| Directory | Description | Stack |
|---|---|---|
| **[e2e-kotlin](e2e-kotlin)** | Runnable CLI translation tool with structured JSON output calling OpenAI | Kotlin, Gradle, OpenAI Java SDK |
| **[e2e-python](e2e-python)** | Runnable city day-planner with weather tool and structured JSON output calling Claude | Python, Anthropic Python SDK |
| **[e2e-rust](e2e-rust)** | Runnable SRE incident commander with service metrics tool and structured JSON output calling Google Gemini | Rust, Cargo, Google Gemini API |
