---
title: Language Reference
description: XML syntax for defining prompt templates, tools, and metadata.
---

# TypePrompt language reference

TypePrompt projects are made up of `.tp` files matching the `include` pattern in `typeprompt.yaml` (usually: `prompts/**/*.tp`). Every file has one of the following root elements:

| Element | Purpose |
|---|---|
| [`<meta>`](#the-meta-element-top-level) | Declare the type of per-template metadata |
| [`<template>`](#the-template-element) | Define a prompt template |
| [`<tool>`](#the-tool-element) | Define a callable tool |
| [`<namespace>`](#the-namespace-element) | Group templates and tools; define shared types |
| [`<playground>`](#the-playground-element) | Define playground samples for a template |

For the type system (schemas, SDL), see the [schema language guide](/schema).

---

## The `<meta>` element (top level)

`<meta>` lets you attach structured metadata to each template — for example, the model to use, the sampling temperature, or any other configuration your LLM client needs. You define the shape of that metadata once at the top level, then supply values per template.

`<meta>` can therefore appear in two places: once at the top level of a file to *declare* the metadata type, and once inside each `<template>` to *supply* the metadata values.

At the top level of a file, the text content of `<meta>` must define a `Meta` type using TypePrompt's SDL.

```xml
<!-- meta.tp -->
<meta>
  interface Meta {
    /** Sampling temperature (0–2). */
    temperature: number;
    model?: "gpt4o" | "gpt4oMini" | "o3";
  }
</meta>
```

---

## The `<template>` element

A `<template>` defines a prompt that can be built and sent to an LLM.

**Attributes:**

| Attribute | Required | Format | Description |
|---|---|---|---|
| `name` | Yes | `PascalCase` | Unique name within the namespace |
| `namespace` | No | `PascalCase` | Namespace this template belongs to; defaults to `Main` |

**Child elements** (in any order):

| Element | Required | Description |
|---|---|---|
| `<meta>` | If top-level `<meta>` exists | Per-template metadata values |
| `<schema>` | Yes | `Input` and `Output` types |
| `<tools>` | No | Tools the model may call |
| `<system>` | Yes | System instructions |
| `<user>` | Yes | User message |
| `<examples>` | No | Few-shot examples |
| `<snippet>` | No | Reusable text fragments |
| `<variant>` | No | Prompt variants |

---

### Template-level `<meta>` — supplying values

When a top-level `<meta>` is declared, every `<template>` must include a `<meta>` child whose text content is a YAML value of type `Meta`.

```xml
<!-- Summarize.tp -->
<template name="Summarize">
  <meta>
    temperature: 0.3
    model: gpt4o
  </meta>
  ...
</template>
```

### The `<schema>` element

Defines the `Input` and `Output` types for the template using TypePrompt's SDL. Both types are required.

```xml
<!-- ClassifyEmail.tp -->
<template name="ClassifyEmail">
  <schema>
    interface Input {
      subject: string;
      body: string;
      recipients: Recipient[];
    }

    interface Recipient {
      emailAddress: string;
      alias: string;
    }

    interface Output {
      category: "billing" | "support" | "feedback" | "other";
      summary: string;
    }
  </schema>
  ...
</template>
```

**Attributes:**

| Attribute | Values | Default | Description |
|---|---|---|---|
| `output-format` | `json`, `text` | `json` | How the model's response is parsed. Use `text` when `Output` is `string`. |

---

### The `<tools>` element

Registers tools that the model may call during this prompt. Contains one or more `<tool>` child elements referencing defined tools.

```xml
<!-- ResearchAssistant.tp -->
<template name="ResearchAssistant">
  <tools>
    <tool name="webSearch" />
    <tool name="readDocument" />
  </tools>
  ...
</template>
```

Each `name` attribute must match a `<tool>` element defined at the top level (in the same namespace).

---

### The `<system>` and `<user>` elements

These elements contain the system and user messages. Each may contain a mix of plain text and the inline elements described below: [`<insert>`](#insert), [`<enclosed>`](#enclosed), and [`<c>`](#c).

It is very common for the `<user>` message to simply render the `input` value in JSON, YAML, or [TOON](https://toonformat.dev) format:

```xml
<user>
  <insert val="input" format="yaml" />
</user>
```

#### Indentation

TypePrompt automatically strips leading indentation so you can format your XML neatly without it affecting the resolved text.

If the element's content begins with a line containing only whitespace, TypePrompt treats the indent of the *first non-empty line* as the base indent and strips it from every subsequent line. Lines that are non-empty but don't start with the base indent are a compile error.

```xml
<system>
  You are a helpful assistant.
  Today is <insert val="input.dateToday" />.

  Answer the user's question clearly and concisely.
</system>
```

Resolved text:
```
You are a helpful assistant.
Today is 2025-03-14.

Answer the user's question clearly and concisely.
```

---

#### `<insert>`

Inserts a formatted value or a snippet into the message at this position.

**To insert a value**, set the `val` attribute to an expression rooted at `input`:

```xml
<insert val="input.userQuery" />
<insert val="input.documents" format="json" />
```

The `format` attribute controls serialization:

| Value | Description |
|---|---|
| `text` | *(default)* Renders the value as a plain string. The value must be of type `string` or `integer`. |
| `json` | Pretty-printed JSON (2-space indent). |
| `yaml` | YAML serialization. |
| `toon` | [TOON](https://toonformat.dev) — a structured, human-readable format optimized for LLM consumption. |
| `csv` | Comma-separated values. The value must be an array of objects whose fields are strings or numbers; the field names become the header row. |
| `tsv` | Tab-separated values. Same requirements as `csv`. |

**To insert a snippet**, use the `snippet` attribute:

```xml
<insert snippet="systemContext" />
```

**Indentation propagation:** if the `<insert>` tag appears on an indented line, that indentation is prepended to every line of the resolved value or snippet. This lets you embed multi-line content inside a block element cleanly:

```xml
<user>
  <enclosed tag="Document">
    <insert val="input.documentContent" />
  </enclosed>
</user>
```

If `documentContent` is a three-line string, the resolved text is:

```
<Document>
  Line 1
  Line 2
  Line 3
</Document>
```

---

#### `<enclosed>`

Wraps its content in an XML-like tag in the resolved text. This is more readable than escaping `<` and `>` manually.

```xml
<user>
  <enclosed tag="Context">
    <insert val="input.background" />
  </enclosed>
  <enclosed tag="Question">
    <insert val="input.question" />
  </enclosed>
</user>
```

Resolved text:
```
<Context>
  ...background...
</Context>
<Question>
  ...question...
</Question>
```

The `<description>` element inside `<tool>` may also contain `<enclosed>` and `<c>`.

---

#### `<c>`

`<c>` (short for *check*) wraps an identifier or JSON value and verifies at compile time that it matches something in the template's schema. This keeps your instructions in sync with your types — if you rename a field or change a literal value, TypePrompt will report an error wherever `<c>` references the old name.

**Wrapping an identifier:**

```xml
<schema>
  interface Input {
    documentText: string;
    targetLanguage: string;
  }

  interface Output {
    translatedText: string;
    detectedSourceLanguage: string;
  }
</schema>

<system>
  Translate the <c>documentText</c> into the <c>targetLanguage</c>.
  Return the result as <c>translatedText</c> and set <c>detectedSourceLanguage</c>
  to the language you detected in the input.
</system>
```

The valid identifier names are: all field names and string literal values from the template's schema, the names of registered tools, and all field names and string literal values from each registered tool's schema.

For readability, you may quote the identifier inside `<c>`:
`<c>"documentText"</c>` is equivalent to `"<c>documentText</c>"`.

**Wrapping a JSON value:**

`<c>` also validates inline JSON examples — useful when your instructions include sample inputs or outputs:

```xml
<system>
  Translate the given document.

  Example input:  <c>{"documentText": "Bonjour", "targetLanguage": "en"}</c>
  Example output: <c>{"translatedText": "Hello", "detectedSourceLanguage": "fr"}</c>
</system>
```

The compiler checks that the JSON is well-formed and conforms to at least one named type in the schema.

To keep inline examples concise, you may use an ellipsis (`...`) as a placeholder:

```xml
<c>{"documentText": ..., ...}</c>
```

---

### `<examples>`

Defines few-shot examples that are included in every rendered prompt. The text content is a YAML list with the following structure:

```yaml
- input: <Input value>
  output: <Output value>
  steps:  # optional; include when the example involves tool calls
    - toolCalls:
        - callId: <string>
          tool: <tool name>
          input: <tool Input value>
          output: <tool Output value>
```

For a template that classifies emails:

```xml
<examples>
  - input:
      subject: "Invoice #4821 overdue"
      body: "Please settle your outstanding balance."
    output:
      category: billing
      urgency: high
      summary: Overdue invoice reminder.

  - input:
      subject: "Love the new dashboard!"
      body: "The new analytics view is exactly what I needed."
    output:
      category: feedback
      urgency: low
      summary: Positive feedback about the dashboard.
</examples>
```

For a template that uses tools:

```xml
<examples>
  - input:
      question: "What is the capital of France?"
    steps:
      - toolCalls:
        - callId: c1
          tool: webSearch
          input:
            query: "capital of France"
          output:
            results: ["Paris is the capital of France."]
    output:
      answer: Paris
</examples>
```

There may be at most one `<examples>` element per template or variant.

---

### `<snippet>`

A named, reusable fragment of text that can be inserted into `<system>`, `<user>`, or another `<snippet>` using `<insert snippet="..." />`.

```xml
<template name="QuestionAnswerer">
  <system>
    <insert snippet="todayDate" />
    Answer the following question.
  </system>

  <snippet name="todayDate">
    Today's date is <insert val="input.dateToday" />.
  </snippet>
  ...
</template>
```

Snippet names must be `camelCase`. The same indentation-stripping rules that apply to `<system>` and `<user>` apply here.

#### Conditional snippet (`if`)

A snippet can conditionally render one of two bodies depending on an expression:

```xml
<snippet name="locationContext" if="input.userLocation" is="notNull">
  <then>
    The user is located in <insert val="it" />.
  </then>
  <else></else>
</snippet>
```

Inside the `<then>` and `<else>` bodies, `it` is an alias for the expression passed to `if` — in this case `input.userLocation`. This avoids repeating the expression and makes snippets easier to read.

**Attributes:**

| Attribute | Description |
|---|---|
| `if` | Expression to evaluate (e.g. `input.userLocation`) |
| `is` | Condition type: `notNull` (value is not null/undefined), `notEmpty` (string or array is non-empty), `true` (value is truthy). Defaults to `true`. |

When the condition holds, the `<then>` body is rendered; otherwise the `<else>` body is rendered.

#### Switch snippet (`switch`)

A snippet can branch on a string-union expression:

```xml
<snippet name="formalityInstruction" switch="input.tone">
  <on case="formal">Use formal, professional language.</on>
  <on case="casual">Keep the tone friendly and conversational.</on>
  <on case="technical">Use precise technical terminology.</on>
</snippet>
```

The `switch` attribute must resolve to a string-union type, and there must be exactly one `<on case="...">` for each member of that union.

---

### `<variant>`

Variants let you define multiple versions of a prompt that share the same `Input`/`Output` types but differ in instructions or examples — for example, to A/B test different system prompts or to handle a `style` field in the input.

**Requirements:**
- The `Input` type must include a `variant` field of type `"a" | "b" | ...`.
- There must be exactly one `<variant case="...">` for each member of that union.
- Each `<variant>` may contain `<meta>`, `<system>`, `<user>`, and `<examples>`.
- Elements defined directly under `<template>` act as defaults and are inherited by variants that omit them. An element defined under `<template>` cannot be redefined under `<variant>`.

```xml
<!-- WriteEmail.tp -->
<template name="WriteEmail">
  <schema>
    interface Input {
      recipient: string;
      topic: string;
      variant: "formal" | "casual";
    }

    interface Output {
      subject: string;
      body: string;
    }
  </schema>

  <!-- Shared across both variants -->
  <user>
    Recipient: <insert val="input.recipient" />
    Topic: <insert val="input.topic" />
  </user>

  <variant case="formal">
    <system>
      Write a professional business email. Use a formal salutation and sign off with
      "Best regards".
    </system>
    <examples>
      - input:
          recipient: Dr. Lee
          topic: project update
          # Do not specify 'variant': inferred from the enclosing variant
        output:
          subject: Project Status Update
          body: "Dear Dr. Lee, ..."
    </examples>
  </variant>

  <variant case="casual">
    <system>
      Write a friendly, informal email. Keep it short and conversational.
    </system>
  </variant>
</template>
```

---

## The `<tool>` element

Defines a tool that the model can call during prompt execution. Tools have a description (shown to the model), and typed input/output schemas.

**Attributes:**

| Attribute | Required | Format | Description |
|---|---|---|---|
| `name` | Yes | `camelCase` | Unique name within the namespace |
| `namespace` | No | `PascalCase` | Namespace this tool belongs to; defaults to `Main` |

**Child elements:**

| Element | Required | Description |
|---|---|---|
| `<description>` | Yes | Human/model-readable description of what the tool does |
| `<schema>` | Yes | `Input` and `Output` types |

```xml
<!-- getWeather.tp -->
<tool name="getWeather">
  <description>
    Returns the current weather at a given location. Use this when the user's
    request depends on real-time weather conditions.
  </description>

  <schema>
    interface Input {
      city: string;
      countryCode: string;
    }

    interface Output {
      temperatureCelsius: number;
      condition: "sunny" | "cloudy" | "rainy" | "snowy";
      humidity: number;
    }
  </schema>
</tool>
```

The `<description>` element may contain `<c>` and `<enclosed>` in addition to plain text.

---

## The `<namespace>` element

Namespaces serve two purposes: organizing large projects and defining types that are shared across multiple templates and tools within the namespace.

```xml
<!-- Geo/shared.tp -->
<namespace name="Geo">
  interface Address {
    street: string;
    city: string;
    country: string;
  }
</namespace>
```

```xml
<!-- Geo/FormatAddress.tp -->
<template name="FormatAddress" namespace="Geo">
  <schema>
    interface Input {
      address: shared.Address;
      locale: string;
    }

    type Output = string;
  </schema>
  ...
</template>
```

```xml
<!-- Geo/geocode.tp -->
<tool name="geocode" namespace="Geo">
  ...
</tool>
```

Types declared inside `<namespace>` can be referenced from template and tool schemas using the `shared.TypeName` prefix (see [Shared Types](/schema#shared-types)).

**Attributes:**

| Attribute | Required | Format | Description |
|---|---|---|---|
| `name` | Yes | `PascalCase` | Unique identifier for this namespace |

If you don't declare any namespaces, all templates and tools belong to the implicit `Main` namespace. You can still define shared types for that default namespace by declaring `<namespace name="Main">` — any types defined there will be available via `shared.TypeName` in all `Main` templates and tools.

---

## The `<playground>` element

`<playground>` defines playground samples for a prompt template. Playgrounds live in their own `.tp` file alongside the template they target.

Inside `<playground>`, model configuration is defined in a `<model>` element, and test samples are defined as a YAML array nested inside a `<samples>` element. Each sample provides an input, optional history of previous completed turns, and optional intermediate steps (tool calls) taken during the current turn.

**Attributes:**

| Attribute | Required | Format | Description |
|---|---|---|---|
| `for` | Yes | `PascalCase` | Name of the template this playground targets |
| `namespace` | No | `PascalCase` | Namespace of the target template; defaults to `Main` |

### Model configuration

The `<model>` element contains YAML configuration representing model options:

| Field | Required | Type | Description |
|---|---|---|---|
| `model` | Yes | `string` | Model identifier (e.g. `openai/gpt-4o`, `anthropic/claude-sonnet-4.5`) |
| `temperature` | No | `number` | Sampling temperature |
| `maxTokens` / `maxOutputTokens` | No | `number` | Maximum tokens to generate |
| `topP` | No | `number` | Nucleus sampling probability threshold |
| `topK` | No | `number` | Top-k sampling threshold |
| `presencePenalty` | No | `number` | Presence penalty |
| `frequencyPenalty` | No | `number` | Frequency penalty |
| `stopSequences` | No | `string[]` | Stop sequences |
| `seed` | No | `number` | Random seed |
| `reasoning` | No | `string` | Reasoning effort (`provider-default`, `none`, `minimal`, `low`, `medium`, `high`, `xhigh`) |
| `providerOptions` | No | `object` | Provider-specific options for `openai`, `anthropic`, `google`, `xai`, `mistral` |

### Sample structure

Each sample in the `<samples>` YAML array has the following structure:

| Field | Required | Type | Description |
|---|---|---|---|
| `name` | No | `string` | Optional label or description for the sample |
| `note` | No | `string` | Optional note or commentary about the sample |
| `history` | No | `HistoryEntry[]` | Previous completed turns in multi-turn conversations |
| `input` | Yes | `Input` | Current turn inputs matching the target template's `Input` schema |
| `steps` | No | `Step[]` | Tool calls made during the current turn |

When `history` is specified, each entry represents a completed prior turn:

| Field | Required | Type | Description |
|---|---|---|---|
| `input` | Yes | `Input` | Inputs for that historical turn |
| `steps` | No | `Step[]` | Tool calls made during that turn |
| `output` | Yes | `Output` | Model response for that turn matching the target template's `Output` schema |

Each step in `steps` contains a `toolCalls` list with the following structure:

```yaml
steps:
  - toolCalls:
      - tool: <tool name>
        callId: <string>
        input: <tool Input>   # validated against tool's Input schema
        output: <tool Output> # optional; validated against tool's Output schema
```

### Examples

Given a template defined in `prompts/Translate.tp`:

```xml
<!-- Translate.tp -->
<template name="Translate">
  ...
</template>
```

You can define its playground samples in `prompts/Translate.play.tp`:

```xml
<!-- Translate.play.tp -->
<playground for="Translate">
  <model>
    model: openai/gpt-4o
    temperature: 0.7
  </model>

  <samples>
  - name: "Spanish greeting"
    note: "Informal greeting"
    input:
      text: "Hello, how are you?"
      targetLanguage: "Spanish"

  - name: "French formal"
    input:
      text: "Please take a seat."
      targetLanguage: "French"

  - input:
      text: "What time is it?"
      targetLanguage: "German"
  </samples>
</playground>
```

For multi-turn conversations or templates that use tools:

```xml
<!-- MathAssistant.play.tp -->
<playground for="MathAssistant">
  <model>
    model: anthropic/claude-sonnet-4.5
  </model>

  <samples>
  - name: "Multi-turn math session"
    history:
      - input:
          question: "What is 2+2?"
        steps:
          - toolCalls:
              - tool: calc
                callId: "call-1"
                input:
                  expr: "2+2"
                output:
                  result: 4
        output:
          answer: "4"
    input:
      question: "Now multiply by 10"
    steps:
      - toolCalls:
          - tool: calc
            callId: "call-2"
            input:
              expr: "4*10"
  </samples>
</playground>
```

---

## File naming conventions

By convention, `.tp` files and directories within your prompts directory follow these rules:

| Element | Naming Convention | Single-Namespace Project | Multi-Namespace Project |
|---|---|---|---|
| `<template>` | `PascalCase.tp` | `prompts/MyTemplate.tp` | `prompts/MyNamespace/MyTemplate.tp` |
| `<tool>` | `lowerCamel.tp` | `prompts/myTool.tp` | `prompts/MyNamespace/myTool.tp` |
| `<meta>` | `meta.tp` | `prompts/meta.tp` | `prompts/meta.tp` |
| `<namespace>` | `shared.tp` | `prompts/shared.tp` | `prompts/MyNamespace/shared.tp` |
| `<playground>` | `TemplateName.play.tp` | `prompts/MyTemplate.play.tp` | `prompts/MyNamespace/MyTemplate.play.tp` |

### Single-namespace project layout

```
.
├── typeprompt.yaml
└── prompts/
    ├── meta.tp
    ├── shared.tp
    ├── Translate.tp
    ├── Translate.play.tp
    ├── TriageTicket.tp
    └── webSearch.tp
```

### Multi-namespace project layout

```
.
├── typeprompt.yaml
└── prompts/
    ├── meta.tp
    ├── Finance/
    │   ├── shared.tp
    │   ├── DetectAnomaly.tp
    │   └── SummarizeTransaction.tp
    └── Legal/
        ├── shared.tp
        ├── DraftNda.tp
        ├── DraftNda.play.tp
        └── SummarizeClause.tp
```

