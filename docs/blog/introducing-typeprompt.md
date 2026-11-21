---
title: Introducing TypePrompt
date: 2026-11-21
author: Gepheum Lab
description: Why we built a compiler for LLM prompts, and how TypePrompt keeps your templates, schemas, and application code in sync.
---

# Introducing TypePrompt

Moving prompts into dedicated files (instead of multiline strings buried in application code) makes them much easier to read, review, and iterate on. The usual tradeoff is that your application code can start drifting from your prompt files: you rename a variable in code without updating a placeholder, change an output type while the prompt still asks for the old fields, or leave few-shot examples teaching the model an outdated shape.

**TypePrompt** gives you dedicated prompt files without giving up compile-time checks, compiling them into native code across 8 languages.

## What it does

Each `.tp` file holds everything about a single prompt in one place: its instructions, its `Input` and `Output` types (written in a subset of TypeScript), any tools it can call, and its few-shot examples in YAML.

```xml
<!-- DecodeCatMood.tp -->
<template name="DecodeCatMood">
  <meta>
    model: gpt-4o
    temperature: 0.2
  </meta>

  <schema>
    interface Input {
      catAction: string;
      bowlStatus: "empty" | "half-empty";
    }

    interface Output {
      demand: "feed-me" | "kneel" | "chaos";
      urgency: "chill" | "crisis";
      /** What the human servant must immediately do. */
      humanAction: string;
    }
  </schema>

  <system>
    You are an expert feline behavior interpreter.
    Decode <c>catAction</c> into its true <c>demand</c>.
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

When you run `bunx @typeprompt/cli gen`, the compiler validates the entire file against its `<schema>`. Every `<c>` reference in your instructions and every YAML entry in `<examples>` is checked against your schemas. If you rename `catAction` to `action`, the compiler immediately flags `<c>catAction</c>` and the `<examples>` block.

It then generates native code for your target language. At the call site, `render(...)` enforces the exact `Input` type, so you can't forget a required placeholder, pass the wrong type, or use an invalid enum value like `"full"` instead of `"empty" | "half-empty"`:

```typescript
import { prompts } from "./gen/prompts.js";
import { executePrompt } from "./llm.js";

const prompt = prompts.decodeCatMood.render({
  catAction: "Sit on keyboard",
  bowlStatus: "half-empty",
});

const result = await executePrompt(prompt);
console.log(result.humanAction);
```

## Why it's not an LLM SDK

One deliberate choice early on: TypePrompt does not make network calls and does not wrap OpenAI, Anthropic, or Gemini.

Provider SDKs change constantly (new reasoning parameters, caching headers, streaming shapes, custom retries, internal proxies). Whenever a prompt framework wraps the SDK, you end up fighting the wrapper. With TypePrompt, you write one small generic `executePrompt` function in your own codebase using whatever SDK you already have. TypePrompt just hands it the rendered messages, tools, and JSON Schema, and parses the raw response back into a typed object.

## What's ready today

TypePrompt currently compiles to 8 languages: TypeScript, Python, Kotlin, Rust, C++, Swift, Dart, and C#.

A few other things we built because we kept wanting them ourselves:

- **A Playground right in VS Code (and the CLI).** You can keep sample inputs in a `.play.tp` file next to your template and run them against real models from the [VS Code extension](https://marketplace.visualstudio.com/items?itemName=gepheum.typeprompt-vscode) or `bunx @typeprompt/cli run`, without copy-pasting prompts into a web console.
- **Formatting and editor support.** There's a standalone Language Server (`bunx @typeprompt/language-server`) with diagnostics, go-to-definition, and rename, plus `bunx @typeprompt/cli format` so `.tp` files stay tidy in CI.
- **Variants and runtime overrides.** You can keep A/B [variants](/reference#variant) under one schema, or load [template overrides](/template-overrides) at runtime when you want to iterate on wording without redeploying.
- **An agent skill.** If you use Claude Code, Cursor, or another coding agent, `npx skills add gepheum/typeprompt` gives it the `.tp` syntax and CLI rules out of the box.

## Give it a try

```bash
bunx @typeprompt/cli init
```

The [Quick start guide](/quick-start) walks through setting up a project in a couple of minutes, and there are self-contained [examples](/examples) covering tools, complex types, variants, and namespaces. Everything is MIT-licensed on [GitHub](https://github.com/gepheum/typeprompt). If you try it and run into something rough, open an issue.
