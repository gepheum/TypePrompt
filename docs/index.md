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
    // Variables provided to render the prompt
    interface Input {
      action: string;
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
        action: "Yowl at 3am"
        bowlStatus: half-empty
      output:
        demand: feed-me
        urgency: crisis
        humanAction: "Shake the bowl to cover the bottom."
  </examples>
</template>
```

`npx typeprompt gen` turns it into a native, type-safe API for your target language. In your application code:

::: code-group

```typescript [TypeScript]
// MyApp.ts

import { prompts } from "./gen/prompts.js";

// 1. Resolve the prompt template with typed input
const prompt = prompts.decodeCatMood.render({
  action: "Sit on keyboard",
  bowlStatus: "half-empty",
});

// ... send prompt to LLM ...

// 2. Parse the LLM response into strongly-typed output
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
        action="Sit on keyboard",
        bowl_status="half-empty",
    )
)

# ... send prompt to LLM ...

# 2. Parse the LLM response into strongly-typed output
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

```rust [Rust]
// main.rs

use my_app::gen::prompts::{schema, PROMPTS};

// 1. Resolve the prompt template with typed input
let prompt = PROMPTS.render_decode_cat_mood(&schema::decode_cat_mood::Input {
    action: "Sit on keyboard".to_string(),
    bowl_status: schema::decode_cat_mood::Input_BowlStatus::HalfEmpty,
});

// ... send prompt to LLM ...

// 2. Parse the LLM response into strongly-typed output
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
    .action = "Sit on keyboard",
    .bowl_status = schema::decode_cat_mood::Input_BowlStatus::kHalfEmpty,
});

// ... send prompt to LLM ...

// 2. Parse the LLM response into strongly-typed output
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
        action: "Sit on keyboard",
        bowlStatus: .halfEmpty
    )
)

// ... send prompt to LLM ...

// 2. Parse the LLM response into strongly-typed output
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
    action: "Sit on keyboard",
    bowlStatus: DecodeCatMood_Input_BowlStatus.halfEmpty,
  ),
);

// ... send prompt to LLM ...

// 2. Parse the LLM response into strongly-typed output
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
    Action = "Sit on keyboard",
    BowlStatus = Schema.DecodeCatMood.Input_BowlStatus.HalfEmpty
});

// ... send prompt to LLM ...

// 2. Parse the LLM response into strongly-typed output
var result = prompt.ParseResponse(rawResponse);
Console.WriteLine(result.HumanAction);
// "Surrender the warm laptop and apologize for trying to work."
```

:::

If the schema and the template drift apart, this fails to compile — not at runtime, in production, after the model replies. [Read the documentation →](/guide/#getting-started)

## Works with your stack

TypeScript · Python · Kotlin · Rust · C++ · Swift · Dart · C#

Pick yours from the **Languages** menu above.
