# TypePrompt

**End-to-end type safety for LLM prompts.**

[Website](https://typeprompt.dev) · [Docs](https://typeprompt.dev/introduction) · [Quick Start](https://typeprompt.dev/quick-start) · [Playground](https://typeprompt.dev/playground) · [GitHub](https://github.com/gepheum/typeprompt)

Official VS Code extension for authoring and testing [TypePrompt](https://typeprompt.dev) templates (`.tp`).

## Extension features

- **Playground preview**: Run sample inputs (`.play.tp`) against real LLMs directly inside VS Code and inspect parsed outputs, tool calls, latency, and token usage.
- **Real-time diagnostics**: Instant validation for XML syntax, schemas, few-shot examples, and `typeprompt.yaml`.
- **Autocompletion & semantic highlighting**: Context-aware completions and semantic coloring for template tags, schemas, types, and attributes.
- **Navigation & refactoring**: Go to Definition (`F12`), Find References (`Shift+F12`), and project-wide Rename Symbol (`F2`).
- **Formatting & smart editing**: Format `.tp` files on save or on demand, with context-aware indentation and comment toggling.

---

## What is TypePrompt?

TypePrompt lets you write prompt templates with TypeScript-based schemas, tools, and few-shot examples in dedicated `.tp` files. It compiles them into a type-safe API for **TypeScript, Python, Kotlin, Rust, C++, Swift, Dart, and C#** — with zero framework lock-in, ready to drop into whatever LLM SDK you already use.

```xml
<!-- DecodeCatMood.tp -->

<template name="DecodeCatMood">
  <meta>
    model: gpt-4o
    temperature: 0.2
  </meta>

  <schema>
    // Variables provided to render the prompt
    interface Input {
      catAction: string;
      bowlStatus: "empty" | "half-empty";
    }

    // Structured JSON response expected from the model
    interface Output {
      demand: "feed-me" | "kneel" | "chaos";
      urgency: "chill" | "crisis";
      /** What the human servant must immediately do. */
      humanAction: string;
    }
  </schema>

  <system>
    You are an expert feline behavior interpreter.
    Decode cat actions into their true demands.
  </system>

  <user>
    <insert val="input" format="yaml" />
  </user>

  <examples>
    - input:
        catAction: Yowl at 3am
        bowlStatus: half-empty
      output:
        demand: feed-me
        urgency: crisis
        humanAction: Shake the bowl to cover the bottom.
  </examples>
</template>
```

`npx typeprompt gen` compiles your templates into native code:

```typescript
// MyApp.ts

import { prompts } from "./gen/prompts.js";
import { executePrompt } from "./llm.js";

// 1. Render the prompt template with strongly-typed input
const prompt = prompts.decodeCatMood.render({
  catAction: "Sit on keyboard",
  bowlStatus: "half-empty",
});

// 2. Send it via your own generic helper wrapping any LLM SDK.
// It forwards the rendered messages, tools, examples, and JSON Schema,
// calls prompt.parseResponse(...), and returns the strongly-typed output.
const result = await executePrompt(prompt);

console.log(result.humanAction);
// "Surrender warm laptop and apologize for trying to work."
```

If your application code and your templates drift apart, your compiler or type checker catches it — not at runtime, in production, after the model replies.

## Getting started

1. Run `npx typeprompt init` in your project root.
2. Configure your target language in `typeprompt.yaml`.
3. Run `npx typeprompt gen` (or `--watch` for automatic regeneration).

See the [Quick start guide](https://typeprompt.dev/quick-start) and [Playground docs](https://typeprompt.dev/playground) to learn more.
