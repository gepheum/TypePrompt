---
layout: home
title: TypePrompt
titleTemplate: End-to-end type safety for LLM prompts

hero:
  name: TypePrompt
  text: End-to-end type safety for LLM prompts
  tagline: Define your input and output schemas once in your prompt templates. TypePrompt keeps your prompts and application code in lockstep, catching mismatches at compile time.
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
  - icon: 🍃
    title: Lightweight prompt management
    details: Organize prompts in dedicated template files instead of hardcoding strings in application code. TypePrompt generates a lightweight API across 8 languages.
  - icon: 🛡️
    title: End-to-end type safety
    details: Enforces compile-time type safety across every stage of the LLM lifecycle — resolving template placeholders, parsing model responses, and dispatching tool calls.
  - icon: 🔷
    title: TypeScript-based SDL
    details: Define schemas with familiar TypeScript syntax. TypePrompt transpiles them into native types across 8 languages, and generates standard JSON Schemas for all major LLM providers.
  - icon: ✅
    title: Validated few-shot examples
    details: Author few-shot examples in YAML that are validated against your schemas and automatically formatted with your user instructions.
  - icon: 🔀
    title: Prompt variants & template overrides
    details: Author multiple prompt versions sharing identical schemas for A/B testing, or dynamically inject template overrides at runtime for rapid experimentation and prompt tuning.
  - icon: 🔋
    title: Batteries included
    details: Ships with a first-class Language Server, a code formatter, and a VS Code extension that lets you try prompts on the fly in your IDE.
---

## See it in action

Prompt templates are plain XML files that bring together typed schemas, prompt instructions, tools, and few-shot examples into a single source of truth:

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
        catAction: "Yowl at 3am"
        bowlStatus: half-empty
      output:
        demand: feed-me
        urgency: crisis
        humanAction: "Shake the bowl to cover the bottom."
  </examples>
</template>
```

`npx typeprompt gen` compiles your templates into a lightweight, type-safe API in your target language. Here's how you use it:

::: code-group

```typescript [TypeScript]
// MyApp.ts

import { prompts } from "./gen/prompts.js";

// 1. Resolve the prompt template with typed input
const prompt = prompts.decodeCatMood.render({
  catAction: "Sit on keyboard",
  bowlStatus: "half-empty",
});

// 2. Send prompt to LLM using your preferred SDK.
// The prompt provides system and user messages, tools,
// few-shot examples, and the response's JSON Schema.

// 3. Parse the LLM response into strongly-typed output
const result = prompt.parseResponse(rawResponse);
console.log(result.humanAction);
// "Surrender the warm laptop and apologize for trying to work."
```

```python [Python]
# my_app.py

from my_app.generated.prompts import prompts, schema

# 1. Resolve the prompt template with typed input
prompt = prompts.decode_cat_mood.render(
    schema.decode_cat_mood.Input(
        cat_action="Sit on keyboard",
        bowl_status="half-empty",
    )
)

# 2. Send prompt to LLM using your preferred SDK.
# The prompt provides system and user messages, tools,
# few-shot examples, and the response's JSON Schema.

# 3. Parse the LLM response into strongly-typed output
result = prompt.parse_response(raw_response)
print(result.human_action)
# "Surrender the warm laptop and apologize for trying to work."
```

```kotlin [Kotlin]
// MyApp.kt

import ai.myapp.generated.prompts.prompts
import ai.myapp.generated.prompts.Schema.DecodeCatMood

// 1. Resolve the prompt template with typed input
val prompt = prompts.renderDecodeCatMood(
    DecodeCatMood.Input(
        catAction = "Sit on keyboard",
        bowlStatus = DecodeCatMood.Input_BowlStatus.HalfEmpty,
    )
)

// 2. Send prompt to LLM using your preferred SDK.
// The prompt provides system and user messages, tools,
// few-shot examples, and the response's JSON Schema.

// 3. Parse the LLM response into strongly-typed output
val result = prompt.parseResponse(rawResponse)
println(result.humanAction)
// "Surrender the warm laptop and apologize for trying to work."
```

```rust [Rust]
// main.rs

use my_app::gen::prompts::{schema, PROMPTS};

// 1. Resolve the prompt template with typed input
let prompt = PROMPTS.render_decode_cat_mood(&schema::decode_cat_mood::Input {
    cat_action: "Sit on keyboard".to_string(),
    bowl_status: schema::decode_cat_mood::Input_BowlStatus::HalfEmpty,
});

// 2. Send prompt to LLM using your preferred SDK.
// The prompt provides system and user messages, tools,
// few-shot examples, and the response's JSON Schema.

// 3. Parse the LLM response into strongly-typed output
let result = prompt.parse_response(raw_response)?;
println!("{}", result.human_action);
// "Surrender the warm laptop and apologize for trying to work."
```

```cpp [C++]
// main.cc

#include "gen/prompts.h"
#include <iostream>

using namespace typeprompt;
using Template = templates::DecodeCatMood;

// 1. Resolve the prompt template with typed input
auto prompt = Render<Template>({
    .cat_action = "Sit on keyboard",
    .bowl_status = schema::decode_cat_mood::Input_BowlStatus::kHalfEmpty,
});

// 2. Send prompt to LLM using your preferred SDK.
// The prompt provides system and user messages, tools,
// few-shot examples, and the response's JSON Schema.

// 3. Parse the LLM response into strongly-typed output
auto result = ParseResponse<Template>(raw_response);
std::cout << result->human_action << "\n";
// "Surrender the warm laptop and apologize for trying to work."
```

```swift [Swift]
// MyApp.swift

import MyPrompts

// 1. Resolve the prompt template with typed input
let prompt = prompts.renderDecodeCatMood(
    Schema.DecodeCatMood.Input(
        catAction: "Sit on keyboard",
        bowlStatus: .halfEmpty
    )
)

// 2. Send prompt to LLM using your preferred SDK.
// The prompt provides system and user messages, tools,
// few-shot examples, and the response's JSON Schema.

// 3. Parse the LLM response into strongly-typed output
let result = try prompt.parseResponse(rawResponse)
print(result.humanAction)
// "Surrender the warm laptop and apologize for trying to work."
```

```dart [Dart]
// my_app.dart

import 'package:my_app/gen/prompts.dart';

// 1. Resolve the prompt template with typed input
final prompt = prompts.renderDecodeCatMood(
  DecodeCatMood_Input(
    catAction: "Sit on keyboard",
    bowlStatus: DecodeCatMood_Input_BowlStatus.halfEmpty,
  ),
);

// 2. Send prompt to LLM using your preferred SDK.
// The prompt provides system and user messages, tools,
// few-shot examples, and the response's JSON Schema.

// 3. Parse the LLM response into strongly-typed output
final result = prompt.parseResponse(rawResponse);
print(result.humanAction);
// "Surrender the warm laptop and apologize for trying to work."
```

```csharp [C#]
// Program.cs

using MyApp.Prompts;

// 1. Resolve the prompt template with typed input
var prompt = Prompts.Default.RenderDecodeCatMood(new Schema.DecodeCatMood.Input
{
    CatAction = "Sit on keyboard",
    BowlStatus = Schema.DecodeCatMood.Input_BowlStatus.HalfEmpty
});

// 2. Send prompt to LLM using your preferred SDK.
// The prompt provides system and user messages, tools,
// few-shot examples, and the response's JSON Schema.

// 3. Parse the LLM response into strongly-typed output
var result = prompt.ParseResponse(rawResponse);
Console.WriteLine(result.HumanAction);
// "Surrender the warm laptop and apologize for trying to work."
```

:::

If the schema and the template drift apart, this fails to compile — not at runtime, in production, after the model replies. [Read the documentation →](/guide/#getting-started)

## Works with your stack

TypeScript · Python · Kotlin · Rust · C++ · Swift · Dart · C#

Pick yours from the **Languages** menu above.
