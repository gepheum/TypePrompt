# TypePrompt Documentation

**TypePrompt** is a tool for managing LLM prompts in your codebase. It brings end-to-end type safety to your AI workflow through code generation, and integrates seamlessly with any LLM SDK.

You write prompt templates in a simple XML format, along with few-shot examples, tools, and schemas (written in a subset of TypeScript). TypePrompt transpiles them into native code for your target language.

### End-to-End Type Safety

- **At template resolution time**: TypePrompt guarantees that the values you pass match the input placeholders expected by the template.
- **At response processing time**: TypePrompt guarantees that the typed objects your application uses to represent the LLM's response match the schema passed to the model.

### Supported Languages

TypeScript, Python, Kotlin, Rust, Swift, Dart, C# (*more languages to come*).

---

## Getting Started

1. **Initialize your project**: Run `npx typeprompt init` in your project root.
2. **Configure target languages**: Edit `typeprompt.yml` to specify your target language.
3. **Generate code**: Run `npx typeprompt gen`, or pass `--watch` for automatic regeneration on file changes.

### Competitors

DotPrompt, FooPrompt

---

## Quick Example

### 1. Define your prompt in XML

```xml
<!-- prompts/triage-ticket.xml -->
<template name="TriageTicket">
  <schema>
    interface Input {
      ticketText: string;
      customerTier: "free" | "pro" | "enterprise";
    }

    interface Output {
      category: "billing" | "technical" | "general";
      priority: "low" | "medium" | "high" | "urgent";
      summary: string;
    }
  </schema>

  <system>
    You are an automated support ticket triage assistant.
  </system>

  <user>
    Customer Tier: <insert val="input.customerTier" />
    Ticket: <insert val="input.ticketText" />
  </user>
</template>
```

### 2. Use the generated code

```ts
import { prompts } from "./gen/prompts.js";

// 1. Template resolution: inputs are checked at compile time
const prompt = prompts.renderTriageTicket({
  ticketText: "Cannot access billing dashboard",
  customerTier: "enterprise",
});

// 2. Pass resolved prompt and JSON schema to your LLM of choice
const response = await openai.chat.completions.create({
  model: "gpt-4o",
  messages: [
    { role: "system", content: prompt.systemMessage },
    { role: "user", content: prompt.userMessage },
  ],
  response_format: {
    type: "json_schema",
    json_schema: { name: "output", strict: true, schema: prompt.outputFormat.jsonSchema },
  },
});

// 3. Response processing: parsed output is strongly typed
const result = prompt.parseResponse(response.choices[0].message.content ?? "");
console.log(result.category, result.priority); // Typed as "billing" | "technical" | "general"
```

---

## CLI Commands

Install and run TypePrompt via `npx`:

```bash
npx typeprompt <command> [options]
```

| Command | Description | Options |
|---|---|---|
| `init` | Initialize a new TypePrompt project with configuration and starter templates. | `-p, --project <path>` |
| `gen` | Compile prompt templates and generate strongly-typed code for configured languages. | `-w, --watch`<br>`-p, --project <path>` |
| `format` | Format all XML template files. | `--ci` (fail if unformatted)<br>`-p, --project <path>` |
| `help` | Display CLI help and command options (`-h`, `--help`). | |
| `version` | Display the installed TypePrompt version (`-v`, `--version`). | |

### Common CLI Options
- `-p, --project <path>`: Path to directory containing `typeprompt.yml` (defaults to current directory).
- `-w, --watch`: Automatically regenerate code when prompt files change (`gen` only).
- `--ci`: CI verification mode that exits with code 1 if files are not properly formatted (`format` only).

---

## Documentation Index

### Core Concepts & Reference
- **[Specification Reference](spec.md)** — Complete XML syntax for `<template>`, `<tool>`, `<meta>`, `<snippets>`, `<variant>`, and `<examples>`.
- **[Schema Reference](schema.md)** — Schema definitions, interfaces, unions, primitives, shared types, and JSON Schema generation.

### Target Language Guides
- **[TypeScript Integration Guide](languages/typescript.md)** — Node.js, Web, Bun, Deno (Zod validation).
- **[Python Integration Guide](languages/python.md)** — Python 3.10+ (Pydantic validation, AsyncOpenAI).
- **[Kotlin Integration Guide](languages/kotlin.md)** — JVM & Android (Kotlinx Serialization, Coroutines).
- **[Dart Integration Guide](languages/dart.md)** — Flutter & Dart standalone.
- **[C# Integration Guide](languages/csharp.md)** — .NET 8 / 9 / 10 (`System.Text.Json`, official OpenAI SDK).
- **[Swift Integration Guide](languages/swift.md)** — Swift Package Manager, iOS, macOS (Foundation `Codable`).
- **[Rust Integration Guide](languages/rust.md)** — Tokio, `serde`, `serde_json`, `reqwest`.
