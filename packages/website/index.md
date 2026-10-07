---
layout: home
title: TypePrompt
titleTemplate: End-to-end type safety for LLM prompts

hero:
  name: TypePrompt
  text: End-to-end type safety for LLM prompts
  tagline: Define your Input and Output schemas once. TypePrompt keeps your prompts and your application code from silently drifting apart, catching mismatches at compile time instead of in production.
  actions:
    - theme: brand
      text: Get Started
      link: /guide/#getting-started
    - theme: alt
      text: Why TypePrompt?
      link: /guide/
    - theme: alt
      text: GitHub
      link: https://github.com/gepheum/typeprompt

features:
  - title: End-to-end type safety
    details: TypePrompt guarantees the values you pass in match the template's input placeholders, and the typed objects your app reads back match the schema sent to the model.
  - title: TypeScript-based SDL
    details: Define Input, Output, and tool schemas using familiar TypeScript interfaces and discriminated unions — no new type system to learn.
  - title: Native code for your language
    details: Generates idiomatic code for TypeScript, Python, Kotlin, Rust, C++, Swift, Dart, or C# — whichever one calls your LLM.
  - title: Typed tool calling
    details: Declare tools with typed inputs and outputs, and get a generated, type-safe dispatcher for handling tool calls.
  - title: Validated few-shot examples
    details: Author few-shot examples in YAML that are checked against your Input and Output schemas at compile time.
  - title: Schema-checked instructions
    details: The &lt;c&gt; tag verifies that fields and sample JSON referenced in your prompt instructions actually match your schema.
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
</template>
```

`npx typeprompt gen` turns it into a native, type-safe API for your target language. Here's application code calling the generated Kotlin API:

```kotlin
val prompt = prompts.renderDecodeCatMood(
    Schema.DecodeCatMood.Input(
        action = "Knock glass",
        bowlStatus = Schema.DecodeCatMood.Input_BowlStatus.Empty,
    )
)

// ... send prompt.systemMessage / prompt.userMessage to your LLM ...

val result = prompt.parseResponse(rawResponse)
println(result.humanAction)
```

If the schema and the template drift apart, this fails to compile — not at runtime, in production, after the model replies. [Read the full guide →](/guide/#getting-started)

## Works with your stack

TypeScript · Python · Kotlin · Rust · C++ · Swift · Dart · C#

Pick yours from the **Languages** menu above.
