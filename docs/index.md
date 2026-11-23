---
layout: home
title: TypePrompt
titleTemplate: LLM prompts that fail at build time

hero:
  name: TypePrompt
  text: LLM prompts that fail at build time
  tagline: Write prompt templates in dedicated files. TypePrompt validates them, then compiles them into a <span class="nowrap">type-safe</span> API across 8 languages. Works with any LLM SDK.
  image:
    src: /tilly.svg
    alt: Tilly

features:
  - icon: 🗂
    title: Self-contained prompt files
    details: Your prompt templates live in dedicated files that bundle prompt instructions, schemas, tools, and few-shot examples. TypePrompt compiles them into a native API.
  - icon: 🔌
    title: Works with your stack
    details: Compiles to 8 programming languages with zero framework lock-in. The generated API drops cleanly into whatever LLM SDK you already use.
  - icon: 🛡️
    title: End-to-end type safety
    details: Enforces compile-time type safety across every stage of the LLM lifecycle — resolving template placeholders, parsing model responses, and dispatching tool calls.
  - icon: 🔷
    title: TypeScript-based schemas
    details: Define schemas with familiar TypeScript syntax. TypePrompt translates them into native types across 8 languages, and generates strict JSON Schemas for all major LLM providers.
  - icon: ✅
    title: Validated few-shot examples
    details: Author few-shot examples in YAML that are validated against your schemas and automatically formatted with your user instructions.
  - icon: 🔋
    title: Batteries included
    details: Ships with a first-class Language Server, a code formatter, and a VS Code extension that lets you try prompts on the fly in your IDE.
---

## See it in action

Prompt templates are plain XML files that bring together prompt instructions, schemas, tools, and few-shot examples into a single source of truth.

<HomeInteractiveExamples />

<p class="code-intro"><code>npx @typeprompt/cli gen</code> compiles your templates into a type-safe API in your target language. Here's how you use it:</p>

::: code-group

```typescript [TypeScript]
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

```python [Python]
# my_app.py

from my_app.generated.prompts import prompts, schema
from my_app.llm import execute_prompt

# 1. Render the prompt template with strongly-typed input
prompt = prompts.decode_cat_mood.render(
    schema.decode_cat_mood.Input(
        cat_action="Sit on keyboard",
        bowl_status="half-empty",
    )
)

# 2. Send it via your own generic helper wrapping any LLM SDK.
# It forwards the rendered messages, tools, examples, and JSON Schema,
# calls prompt.parse_response(...), and returns the strongly-typed output.
result = await execute_prompt(prompt)

print(result.human_action)
# "Surrender warm laptop and apologize for trying to work."
```

```kotlin [Kotlin]
// MyApp.kt

import ai.myapp.generated.prompts.prompts
import ai.myapp.generated.prompts.Schema.DecodeCatMood
import ai.myapp.llm.executePrompt

// 1. Render the prompt template with strongly-typed input
val prompt = prompts.renderDecodeCatMood(
    DecodeCatMood.Input(
        catAction = "Sit on keyboard",
        bowlStatus = DecodeCatMood.Input_BowlStatus.HalfEmpty,
    )
)

// 2. Send it via your own generic helper wrapping any LLM SDK.
// It forwards the rendered messages, tools, examples, and JSON Schema,
// calls prompt.parseResponse(...), and returns the strongly-typed output.
val result = executePrompt(prompt)

println(result.humanAction)
// "Surrender warm laptop and apologize for trying to work."
```

```rust [Rust]
// my_app.rs

use crate::llm::execute_prompt;
use my_app::gen::prompts::{schema, PROMPTS};

// 1. Render the prompt template with strongly-typed input
let prompt = PROMPTS.render_decode_cat_mood(&schema::decode_cat_mood::Input {
    cat_action: "Sit on keyboard".to_string(),
    bowl_status: schema::decode_cat_mood::Input_BowlStatus::HalfEmpty,
});

// 2. Send it via your own generic helper wrapping any LLM SDK.
// It forwards the rendered messages, tools, examples, and JSON Schema,
// calls prompt.parse_response(...), and returns the strongly-typed output.
let result = execute_prompt(&prompt).await?;

println!("{}", result.human_action);
// "Surrender warm laptop and apologize for trying to work."
```

```cpp [C++]
// my_app.cc

#include "gen/prompts.h"
#include "llm.h"
#include <iostream>

using namespace typeprompt;
using Template = templates::DecodeCatMood;

// 1. Render the prompt template with strongly-typed input
auto prompt = Render<Template>({
    .cat_action = "Sit on keyboard",
    .bowl_status = schema::decode_cat_mood::Input_BowlStatus::kHalfEmpty,
});

// 2. Send it via your own generic helper wrapping any LLM SDK.
// It forwards the rendered messages, tools, examples, and JSON Schema,
// calls ParseResponse<Template>(...), and returns the strongly-typed output.
auto result = ExecutePrompt<Template>(prompt);

std::cout << result->human_action << "\n";
// "Surrender warm laptop and apologize for trying to work."
```

```swift [Swift]
// MyApp.swift

import MyPrompts

// 1. Render the prompt template with strongly-typed input
let prompt = prompts.renderDecodeCatMood(
    Schema.DecodeCatMood.Input(
        catAction: "Sit on keyboard",
        bowlStatus: .halfEmpty
    )
)

// 2. Send it via your own generic helper wrapping any LLM SDK.
// It forwards the rendered messages, tools, examples, and JSON Schema,
// calls prompt.parseResponse(...), and returns the strongly-typed output.
let result = try await executePrompt(prompt)

print(result.humanAction)
// "Surrender warm laptop and apologize for trying to work."
```

```dart [Dart]
// my_app.dart

import 'package:my_app/gen/prompts.dart';
import 'package:my_app/llm.dart';

// 1. Render the prompt template with strongly-typed input
final prompt = prompts.renderDecodeCatMood(
  DecodeCatMood_Input(
    catAction: "Sit on keyboard",
    bowlStatus: DecodeCatMood_Input_BowlStatus.halfEmpty,
  ),
);

// 2. Send it via your own generic helper wrapping any LLM SDK.
// It forwards the rendered messages, tools, examples, and JSON Schema,
// calls prompt.parseResponse(...), and returns the strongly-typed output.
final result = await executePrompt(prompt);

print(result.humanAction);
// "Surrender warm laptop and apologize for trying to work."
```

```csharp [C#]
// MyApp.cs

using MyApp.Llm;
using MyApp.Prompts;

// 1. Render the prompt template with strongly-typed input
var prompt = Prompts.Default.RenderDecodeCatMood(new Schema.DecodeCatMood.Input
{
    CatAction = "Sit on keyboard",
    BowlStatus = Schema.DecodeCatMood.Input_BowlStatus.HalfEmpty
});

// 2. Send it via your own generic helper wrapping any LLM SDK.
// It forwards the rendered messages, tools, examples, and JSON Schema,
// calls prompt.ParseResponse(...), and returns the strongly-typed output.
var result = await LlmClient.ExecutePrompt(prompt);

Console.WriteLine(result.HumanAction);
// "Surrender warm laptop and apologize for trying to work."
```

:::

If your application code and your templates drift apart, your compiler or type checker catches it — not at runtime, in production, after the model replies.

## Features

<HomeFeatures />

## Test your templates where you write them

Run sample inputs against a real model and see the output without leaving your IDE.

<VSCodeShowcase />

<HomeClosingCta />
