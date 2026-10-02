# TypePrompt Language Reference

TypePrompt projects are made up of `.xml` files matching the `include` pattern in `typeprompt.yml` (by default, `prompts/**/*.xml`). Every file has one of the following root elements:

| Element | Purpose |
|---|---|
| [`<meta>`](#the-meta-element-top-level) | Declare the type of per-template metadata |
| [`<template>`](#the-template-element) | Define a prompt template |
| [`<tool>`](#the-tool-element) | Define a callable tool |
| [`<namespace>`](#the-namespace-element) | Group templates and tools; define shared types |

For the type system (schemas, SDL), see [schema.md](schema.md).

---

## Table of Contents

1. [`<meta>`](#the-meta-element-top-level)
2. [`<template>`](#the-template-element)
   - [`<schema>`](#the-schema-element)
   - [`<tools>`](#the-tools-element)
   - [`<system>` and `<user>`](#the-system-and-user-elements)
     - [Indentation](#indentation)
     - [`<insert>`](#insert)
     - [`<enclosed>`](#enclosed)
     - [`<c>`](#c)
   - [`<examples>`](#examples)
   - [`<snippet>`](#snippet)
   - [`<variant>`](#variant)
3. [`<tool>`](#the-tool-element)
4. [`<namespace>`](#the-namespace-element)
5. [File Naming Conventions](#file-naming-conventions)

---

## The `<meta>` Element (Top Level)

`<meta>` lets you attach structured metadata to each template — for example, the model to use, the sampling temperature, or any other configuration your LLM client needs. You define the shape of that metadata once at the top level, then supply values per template.

`<meta>` can therefore appear in two places: once at the top level of a file to *declare* the metadata type, and once inside each `<template>` to *supply* the metadata values.

At the top level of a file, the text content of `<meta>` must define a `Meta` type using TypePrompt's SDL.

```xml
<!-- meta.xml -->
<meta>
  interface Meta {
    /** Sampling temperature (0–2). */
    temperature: number;
    model?: "gpt4o" | "gpt4oMini" | "o3";
  }
</meta>
```

---

## The `<template>` Element

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

### Template-Level `<meta>` — Supplying Values

When a top-level `<meta>` is declared, every `<template>` must include a `<meta>` child whose text content is a YAML value of type `Meta`.

```xml
<!-- Summarize.xml -->
<template name="Summarize">
  <meta>
    temperature: 0.3
    model: gpt4o
  </meta>
  ...
</template>
```

### The `<schema>` Element

Defines the `Input` and `Output` types for the template using TypePrompt's SDL. Both types are required.

```xml
<!-- ClassifyEmail.xml -->
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

### The `<tools>` Element

Registers tools that the model may call during this prompt. The text content is a YAML list of tool references.

```xml
<!-- ResearchAssistant.xml -->
<template name="ResearchAssistant">
  <tools>
    - tool: webSearch
    - tool: readDocument
  </tools>
  ...
</template>
```

Each `tool` value must match a `<tool>` element defined at the top level (in the same namespace).

---

### The `<system>` and `<user>` Elements

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
  Today is <insert val="input.dateToday"/>.

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
<insert val="input.userQuery"/>
<insert val="input.documents" format="json"/>
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
<insert snippet="systemContext"/>
```

**Indentation propagation:** if the `<insert>` tag appears on an indented line, that indentation is prepended to every line of the resolved value or snippet. This lets you embed multi-line content inside a block element cleanly:

```xml
<user>
  <enclosed tag="Document">
    <insert val="input.documentContent"/>
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
    <insert val="input.background"/>
  </enclosed>
  <enclosed tag="Question">
    <insert val="input.question"/>
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
<c>{"documentText": "...", ...}</c>
<c>[{"translatedText": "Hello"}, ...]</c>
```

---

### `<examples>`

Defines few-shot examples that are included in every rendered prompt. The text content is a YAML list with the following structure:

```yaml
- input: <Input value>
  output: <Output value>
  intermediateSteps:  # optional; include when the example involves tool calls
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
    intermediateSteps:
      - toolCalls:
        - callId: c1
          tool: webSearch
          input:
            query: "capital of France"
          output:
            results: ["Paris is the capital of France."]
    output:
      answer: Paris
```

There may be at most one `<examples>` element per template or variant.

---

### `<snippet>`

A named, reusable fragment of text that can be inserted into `<system>`, `<user>`, or another `<snippet>` using `<insert snippet="..."/>`.

```xml
<snippet name="todayDate">
  Today's date is <insert val="input.dateToday"/>.
</snippet>

<system>
  <insert snippet="todayDate"/>
  Answer the following question.
</system>
```

Snippet names must be `camelCase`. The same indentation-stripping rules that apply to `<system>` and `<user>` apply here.

#### Conditional Snippet (`if`)

A snippet can conditionally render one of two bodies depending on an expression:

```xml
<snippet name="locationContext" if="input.userLocation" is="notNull">
  <then>
    The user is located in <insert val="it"/>.
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

#### Switch Snippet (`switch`)

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
<!-- WriteEmail.xml -->
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
    Recipient: <insert val="input.recipient"/>
    Topic: <insert val="input.topic"/>
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
          # variant is optional in examples
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

## The `<tool>` Element

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
<!-- getWeather.xml -->
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

## The `<namespace>` Element

Namespaces serve two purposes: organizing large projects and defining types that are shared across multiple templates and tools within the namespace.

```xml
<!-- Geo/shared.xml -->
<namespace name="Geo">
  interface Address {
    street: string;
    city: string;
    country: string;
  }
</namespace>

<!-- Geo/FormatAddress.xml -->
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

<!-- Geo/geocode.xml -->
<tool name="geocode" namespace="Geo">
  ...
</tool>
```

Types declared inside `<namespace>` can be referenced from template and tool schemas using the `shared.TypeName` prefix (see [Shared Types](schema.md#shared-types) in schema.md).

**Attributes:**

| Attribute | Required | Format | Description |
|---|---|---|---|
| `name` | Yes | `PascalCase` | Unique identifier for this namespace |

If you don't declare any namespaces, all templates and tools belong to the implicit `Main` namespace. You can still define shared types for that default namespace by declaring `<namespace name="Main">` — any types defined there will be available via `shared.TypeName` in all `Main` templates and tools.

---

## File Naming Conventions

By convention, `.xml` files and directories within your prompts directory follow these rules:

| Element | Naming Convention | Single-Namespace Project | Multi-Namespace Project |
|---|---|---|---|
| `<template>` | `PascalCase.xml` | `prompts/MyTemplate.xml` | `prompts/MyNamespace/MyTemplate.xml` |
| `<tool>` | `lowerCamel.xml` | `prompts/myTool.xml` | `prompts/MyNamespace/myTool.xml` |
| `<meta>` | `meta.xml` | `prompts/meta.xml` | `prompts/meta.xml` |
| `<namespace>` | `shared.xml` | `prompts/shared.xml` | `prompts/MyNamespace/shared.xml` |

### Single-Namespace Project Layout

```
prompts/
├── meta.xml
├── shared.xml
├── Translate.xml
├── TriageTicket.xml
└── webSearch.xml
```

### Multi-Namespace Project Layout

```
prompts/
├── meta.xml
├── Finance/
│   ├── shared.xml
│   ├── DetectAnomaly.xml
│   └── SummarizeTransaction.xml
└── Legal/
    ├── shared.xml
    ├── DraftNda.xml
    └── SummarizeClause.xml
```
