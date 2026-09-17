# Examples

This directory contains self-contained TypePrompt examples demonstrating various features, from basic text generation to advanced tool calling and namespaced schemas.

---

## Example Projects

| Directory | Description | Key Features |
|---|---|---|
| **[01-basics](01-basics)** | Getting started with basic text generation | Simple prompt template with text output and few-shot examples |
| **[02-complex-schemas](02-complex-schemas)** | Complex input and output schemas | `<meta>`, structured object output, recursive discriminated unions (`PageNode`), TOON-formatted input (`format="toon"`), YAML-formatted input (`format="yaml"`) |
| **[03-tools](03-tools)** | Typed tool definitions and multi-step execution | `<tool>`, `<tools>` registration, few-shot examples with intermediate tool calls |
| **[04-variants](04-variants)** | Multiple prompt variations sharing schemas | `<variant>`, per-variant system prompts and few-shot examples, runtime selection via `Input.variant` |
| **[05-conditional-logic](05-conditional-logic)** | Modular text composition and conditional logic | `<snippet>`, conditional snippets (`if`/`then`/`else`), `switch` snippets, `<insert snippet="...">` |
| **[06-shared-types](06-shared-types)** | Reusable types in the default namespace | `<namespace name="Main">`, shared types referenced via `shared.TypeName` |
| **[07-namespaces](07-namespaces)** | Multi-namespace project organization | Named namespaces (`Finance`, `Legal`), isolated shared types, domain-specific tools and templates |
