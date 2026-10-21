---
layout: home
title: TypePrompt
titleTemplate: End-to-end type safety for LLM prompts

hero:
  name: TypePrompt
  text: End-to-end type safety for LLM prompts
  tagline: Define your Input and Output schemas once. TypePrompt keeps your prompts and your application code from silently drifting apart, catching mismatches at compile time instead of in production.
  image:
    src: /tilly.svg
    alt: Tilly
  actions:
    - theme: brand
      text: Get started
      link: /guide/#getting-started
    - theme: alt
      text: Why TypePrompt?
      link: /guide/
    - theme: alt
      text: GitHub
      link: https://github.com/gepheum/typeprompt

features:
  - title: Lightweight prompt management
    details: Organize prompts in dedicated template files instead of hardcoding strings in application code, without locking you into a heavyweight framework.
  - title: End-to-end type safety
    details: Enforces compile-time type safety across every stage of the LLM lifecycle — resolving template placeholders, parsing model responses, and dispatching tool calls.
  - title: TypeScript-based SDL
    details: Define schemas with familiar TypeScript types and generate standard JSON Schemas for OpenAI, Gemini, and Anthropic.
  - title: Validated few-shot examples
    details: Author few-shot examples in YAML that are validated against your schemas and automatically formatted with your user instructions.
  - title: Prompt variants & template overrides
    details: Author multiple prompt versions sharing identical schemas for A/B testing, and dynamically inject template overrides at runtime for rapid experimentation and prompt tuning.
  - title: Flexible input formatting
    details: Format complex input types using JSON, YAML, CSV, or TOON without changing application code.
  - title: Custom structured metadata (<meta>)
    details: Define your own Meta schema to attach typed configuration (e.g., model, temperature, routing tags) to each template, tailored to any LLM SDK.
  - title: Developer experience & tooling
    details: Official VS Code extension, standalone Language Server, CLI watch mode, and built-in template formatter.
---

## See it in action

A template is plain XML, with a typed schema, instructions, and few-shot examples:

```xml
<template name="DecodeCatMood">
  <meta>
    model: gpt-4o
    temperature: 0.2
  </meta>

  <schema>
    interface Input {
      /** What the cat was observed doing. */
      action: string;
      bowlStatus: "empty" | "half-empty";
    }

    interface Output {
      demand: "feed-me" | "kneel" | "chaos";
      urgency: "chill" | "crisis";
      humanAction: string;
    }
  </schema>

  <system>
    You are an expert feline behavior interpreter.
    Decode cat actions into their true demands.
  </system>

  <user>
    Action: <insert val="input.action" />
    Food bowl: <insert val="input.bowlStatus" />
  </user>

  <examples>
    - input:
        action: "Yowl at 3am"
        bowlStatus: half-empty
      output:
        demand: feed-me
        urgency: crisis
        humanAction: "Shake the bowl to cover the bottom."

    - input:
        action: "Knock glass"
        bowlStatus: empty
      output:
        demand: kneel
        urgency: crisis
        humanAction: "Apologize and refill the bowl."
  </examples>
</template>
```

`npx typeprompt gen` turns it into a native, type-safe API for your target language. In your application code:

```kotlin
// MyApp.kt

import ai.myapp.generated.prompts.prompts
import ai.myapp.generated.prompts.Schema.DecodeCatMood

// 1. Resolve the prompt template with typed input
val prompt = prompts.renderDecodeCatMood(
    DecodeCatMood.Input(
        action = "Sit on keyboard",
        bowlStatus = DecodeCatMood.Input_BowlStatus.HalfEmpty,
    )
)

// ... send prompt to LLM ...

// 2. Parse the LLM response into strongly-typed output
val result = prompt.parseResponse(rawResponse)
println(result.humanAction)
// "Surrender the warm laptop and apologize for trying to work."
```

If the schema and the template drift apart, this fails to compile — not at runtime, in production, after the model replies. [Read the documentation →](/guide/#getting-started)

## Works with your stack

TypeScript · Python · Kotlin · Rust · C++ · Swift · Dart · C#

Pick yours from the **Languages** menu above.
