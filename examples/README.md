# Examples

This directory contains self-contained TypePrompt examples demonstrating various features, from basic text generation to advanced tool calling and namespaced schemas.

---

## Example Projects

| Directory | Description | Key Features |
|---|---|---|
| **[01-basics](01-basics)** | Getting started with basic text generation | Simple prompt template with text output and few-shot examples |
| **[02-structured-output](02-structured-output)** | Complex input/output schemas | `<meta>`, structured object output, recursive discriminated unions (`PageNode`), structured object input formatted in YAML |
| **[03-tools](03-tools)** | Typed tool definitions and multi-step execution | `<tool>`, `<tools>` registration, few-shot examples with intermediate tool calls |
| **[04-variants](04-variants)** | Multiple prompt variations sharing schemas | `<variant>`, per-variant system prompts and few-shot examples, runtime selection via `Input.variant` |
| **[05-snippets](05-snippets)** | Modular text composition and conditional logic | `<snippet>`, conditional snippets (`if`/`then`/`else`), `switch` snippets, `<insert snippet="...">` |
| **[06-toon-format](06-toon-format)** | Dense structured input formatting | `format="toon"` ([TOON](https://toonformat.dev)) for compact, LLM-friendly nested data |
| **[07-shared-types](07-shared-types)** | Reusable types in the default namespace | `<namespace name="Main">`, shared types referenced via `shared.TypeName` |
| **[08-namespaces](08-namespaces)** | Multi-namespace project organization | Named namespaces (`Finance`, `Legal`), isolated shared types, domain-specific tools and templates |
