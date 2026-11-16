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

Prompt templates are plain XML files that bring together typed schemas, prompt instructions, tools, and few-shot examples into a single source of truth.

::: code-group

```xml [Simple]
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

```xml [Complex types]
<template name="GeneratePageTree">
  <meta>
    model: gpt-4o
    temperature: 0.2
  </meta>

  <schema>
    interface Input {
      providers: Provider[];
      /** The use case this comparison should be framed around. */
      useCase: string;
      /** Target audience for the page. */
      audience: "developer" | "architect" | "businessDecisionMaker";
    }

    type Provider = {
      name: string;
      region: string;
      category: ProductCategory;
      pricing: Pricing;
      benchmarks: Benchmark[];
      pros: string[];
      cons: string[];
    };

    type ProductCategory = "storage" | "compute" | "database" | "networking";

    type Pricing = {
      model: "perHour" | "perMonth" | "perRequest";
      basePrice: number;
      /** Price per additional unit beyond the base tier, if applicable. */
      overage?: number;
    };

    type Benchmark = {
      name: string;
      score: number;
      unit: string;
    };

    interface Output {
      root: PageNode;
    }

    /** A node in the rendered page tree. */
    type PageNode =
      | {
          kind: "heading";
          level: "h1" | "h2" | "h3";
          text: string;
        }
      | {
          kind: "paragraph";
          text: string;
        }
      | {
          kind: "button";
          label: string;
          /** Destination URL or action target. */
          url: string;
        }
      | {
          kind: "section";
          title?: string;
          children: PageNode[];
        };
  </schema>

  <system>
    You are a UI layout generator. Given provider benchmarks, pricing, and a target
    use case, generate a comparison page layout represented as a hierarchy of
    page nodes.

    - Use <c>"section"</c> nodes to group related elements under a logical container.
    - Start with a top-level <c>"heading"</c> with <c>level</c> <c
      >"h1"</c> or wrap the page in a root <c>"section"</c>.
    - Use <c>"paragraph"</c> nodes for descriptive analysis tailored to the target <c
      >audience</c>.
    - Add <c>"button"</c> nodes for relevant calls to action.
  </system>

  <user>
    Generate a comparison page layout framed around this use case: <insert
        val="input.useCase"
      />

    Target audience: <insert val="input.audience" />

    Here is the data for each provider:

    <insert val="input.providers" format="toon" />
  </user>

  <examples>
    - input:
        useCase: serving ML inference workloads
        audience: architect
        providers:
          - name: CloudX
            region: us-east
            category: compute
            pricing:
              model: perHour
              basePrice: 0.1
            benchmarks:
              - name: throughput
                score: 1000
                unit: rps
            pros:
              - fast
              - reliable
            cons:
              - pricey
      output:
        root:
          kind: section
          title: "Cloud Provider Comparison: ML Inference"
          children:
            - kind: heading
              level: h1
              text: Cloud Infrastructure Comparison
            - kind: paragraph
              text: >-
                An architectural evaluation of compute providers optimized
                for real-time machine learning inference.
            - kind: section
              title: CloudX Overview
              children:
                - kind: paragraph
                  text: >-
                    CloudX delivers 1000 rps throughput in us-east at
                    $0.10/hour, ideal for high-throughput low-latency
                    inference.
                - kind: button
                  label: View Benchmark Details
                  url: https://example.com/benchmarks/cloudx
  </examples>
</template>
```

```xml [Tools]
<template name="ResearchQuestion">
  <meta>
    model: gpt-4o
    temperature: 0.2
  </meta>

  <schema>
    interface Input {
      question: string;
    }

    interface Output {
      answer: string;
      /** URLs of sources used. */
      sources: string[];
    }
  </schema>

  <tools>
    <tool name="webSearch" />
  </tools>

  <system>
    You are a research assistant. Use the <c>webSearch</c> tool to find
    up-to-date information, then provide a concise, well-sourced answer.
    Always cite the URLs you relied on.
  </system>

  <user>
    <insert val="input.question" />
  </user>

  <examples>
    - input:
        question: What is the current population of Tokyo?
      steps:
        - toolCalls:
            - callId: s1
              tool: webSearch
              input:
                query: Tokyo population 2024
              output:
                results:
                  - title: Tokyo Metropolitan Government
                    url: https://www.metro.tokyo.lg.jp/english/
                    snippet: As of 2024, the population of Tokyo is approximately 13.96 million.
      output:
        answer: As of 2024, Tokyo's population is approximately 13.96 million.
        sources:
          - https://www.metro.tokyo.lg.jp/english/
  </examples>
</template>
```

```xml [Variants]
<template name="WriteProductDescription">
  <meta>
    model: gpt-4o
    temperature: 0.2
  </meta>

  <schema>
    interface Input {
      productName: string;
      features: string[];
      variant: "marketing" | "technical" | "brief";
    }

    interface Output {
      description: string;
    }
  </schema>

  <!-- Shared user message: same for all variants -->
  <user>
    Product: <insert val="input.productName" />
    Features: <insert val="input.features" format="json" />
  </user>

  <variant case="marketing">
    <system>
      Write an engaging, benefit-focused product description for a marketing
      website. Lead with the customer's problem, then present the product as
      the solution. Use vivid, persuasive language. Keep it to 2–3 sentences.
    </system>
    <examples>
      - input:
          productName: AquaFilter Pro
          features:
            ["removes 99.9% of contaminants", "lasts 6 months", "easy installation"]
          # variant field must be omitted when inside a variant tag
        output:
          description: >
            Tired of worrying about what's in your tap water? AquaFilter Pro
            eliminates 99.9% of contaminants, so your family drinks nothing but
            pure, clean water — and it installs in minutes and lasts six months.
    </examples>
  </variant>

  <variant case="technical">
    <system>
      Write a precise, specification-driven product description for a technical
      datasheet. List key capabilities clearly. Avoid marketing language.
    </system>
    <examples>
      - input:
          productName: AquaFilter Pro
          features:
            ["removes 99.9% of contaminants", "lasts 6 months", "easy installation"]
        output:
          description: >
            AquaFilter Pro is a point-of-use water filtration unit rated to
            remove 99.9% of contaminants including heavy metals and chlorine.
            Filter lifespan: 6 months / ~1,500 L. Tool-free cartridge
            replacement; compatible with standard ½" fittings.
    </examples>
  </variant>

  <variant case="brief">
    <system>
      Write a single punchy sentence — product name, top benefit, one
      differentiator. 15 words maximum.
    </system>
    <examples>
      - input:
          productName: AquaFilter Pro
          features:
            ["removes 99.9% of contaminants", "lasts 6 months", "easy installation"]
        output:
          description: >-
            AquaFilter Pro delivers pure water with zero-tool installation
            and a 6-month filter life.
    </examples>
  </variant>
</template>
```

```xml [Conditional logic]
<template name="SummarizeDocument">
  <meta>
    model: gpt-4o
    temperature: 0.2
  </meta>

  <schema>
    interface Input {
      title: string;
      content: string;
      /** If provided, the summary should focus on this topic. */
      focusTopic?: string;
      audience: "executive" | "technical" | "general";
    }

    interface Output {
      summary: string;
      keyPoints: string[];
    }
  </schema>

  <system>
    You are an expert document summarizer.
    <insert snippet="audienceInstruction" />
    <insert snippet="focusInstruction" />
  </system>

  <user>
    Summarize the following document.

    <enclosed tag="Title"><insert val="input.title" /></enclosed>
    <enclosed tag="Document"><insert val="input.content" /></enclosed>
  </user>

  <examples>
    - input:
        title: Quarterly Platform Migration
        content: >-
          We completed migrating our primary database cluster to PostgreSQL 16.
          Query latency dropped 30% and throughput increased by 40%.
        audience: executive
      output:
        summary: >-
          Primary database cluster successfully migrated to PostgreSQL 16,
          resulting in a 30% latency drop and 40% throughput increase.
        keyPoints:
          - Completed migration to PostgreSQL 16
          - Query latency decreased by 30%
          - System throughput increased by 40%

    - input:
        title: API Gateway Redesign
        content: >-
          The API gateway was updated with gRPC-Web proxying and Redis
          rate-limiting middleware. P99 latency is down 12ms.
        focusTopic: Rate Limiting
        audience: technical
      output:
        summary: >-
          API gateway migration introduced Redis-backed token bucket rate
          limiting and gRPC-Web proxying, cutting P99 latency by 12ms.
        keyPoints:
          - Added Redis rate-limiting middleware
          - Implemented gRPC-Web proxying
          - Reduced P99 latency by 12ms
  </examples>

  <!--
    Reusable snippet: inserted at the top of the system prompt.
    Uses <insert val="it"/> to reference the focusTopic expression tested by `if`.
  -->
  <snippet name="focusInstruction" if="input.focusTopic" is="notNull">
    <then>
      Focus the summary specifically on the topic: <insert val="it" />.
    </then>
    <else />
  </snippet>

  <!--
    Switch snippet: tailors the tone to the target audience.
  -->
  <snippet name="audienceInstruction" switch="input.audience">
    <on case="executive">
      Write for a non-technical executive audience. Be concise and highlight
      business impact. Avoid jargon.
    </on>
    <on case="technical">
      Write for a technical audience. You may use domain-specific terminology
      and include implementation details where relevant.
    </on>
    <on case="general">
      Write for a general audience with no assumed background knowledge.
      Explain any specialized terms you use.
    </on>
  </snippet>
</template>
```

:::

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
// "Surrender warm laptop and apologize for trying to work."
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
# "Surrender warm laptop and apologize for trying to work."
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
// "Surrender warm laptop and apologize for trying to work."
```

```rust [Rust]
// my_app.rs

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
// "Surrender warm laptop and apologize for trying to work."
```

```cpp [C++]
// my_app.cc

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
// "Surrender warm laptop and apologize for trying to work."
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
// "Surrender warm laptop and apologize for trying to work."
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
// "Surrender warm laptop and apologize for trying to work."
```

```csharp [C#]
// MyApp.cs

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
// "Surrender warm laptop and apologize for trying to work."
```

:::

If the schema and the template drift apart, this fails to compile — not at runtime, in production, after the model replies. [Read the documentation →](/guide/#getting-started)

## Test prompts on the fly in your IDE

Tweak prompt templates, edit input samples, and run live inferences against any LLM without leaving your editor.

<VSCodeShowcase />
