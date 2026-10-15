---
title: Dart
description: How to use TypePrompt-generated Dart code in your application.
---

# Dart integration guide

This guide explains how to use TypePrompt-generated Dart code in your application.

---

## Installation & setup

TypePrompt generates clean, standalone Dart code that relies on these lightweight dependencies:

In your `pubspec.yaml`:

```yaml
dependencies:
  toon_format:
    git: https://github.com/toon-format/toon-dart.git
  yaml_writer: ^2.1.0
```

In your `typeprompt.json` configuration file, specify your Dart output path:

```json
{
  "gen": {
    "dart": {
      "file": "lib/gen/prompts.dart"
    }
  }
}
```

Generate the Dart code:

```bash
npx typeprompt gen
```

---

## Quick start

Import the generated file and call the template render method on the `prompts` singleton:

```dart
import 'package:my_app/gen/prompts.dart';

final prompt = prompts.renderTranslate(
  Translate_Input(
    text: "Hello world",
    targetLanguage: "French",
  ),
);

print(prompt.systemMessage);
print(prompt.userMessage);
```

---

## The `Prompt` object

Calling a `render*` method returns a `Prompt<Output, ToolExecutor>` object with everything needed to interact with an LLM:

| Property / Method | Description |
|---|---|
| `prompt.systemMessage` | Rendered system prompt string. |
| `prompt.userMessage` | Rendered user prompt string. |
| `prompt.meta` | Typed metadata defined in the template (e.g., `model`, `temperature`). |
| `prompt.examples` | List of few-shot examples (`FewShotExample`), if defined. |
| `prompt.tools` | Map of available tool definitions and their JSON schemas. |
| `prompt.outputFormat` | Output descriptor (`JsonOutputFormat` with `jsonSchema`, or `TextOutputFormat`). |
| `prompt.parseResponse(response)` | Parses and validates raw LLM response text into the typed `Output`. |
| `prompt.executeTools(calls, executor)` | Concurrently executes tool calls using your tool executor implementation. |

---

## Parsing LLM responses

Pass the LLM's response string to `prompt.parseResponse()` to validate and parse it into your typed output:

```dart
final rawModelOutput = response.choices.firstOrNull?.message.content ?? "";

final result = prompt.parseResponse(rawModelOutput);
// result is fully typed according to the template's output schema
```

- **JSON Outputs**: Automatically strips markdown code fences (`` ```json ... ``` ``) and parses the JSON into the strongly typed model class.
- **Text Outputs**: Returns the raw text string directly as a `String`.

---

## Executing tools

When a template defines `<tools>`, implement the tool executor interface and dispatch tool calls with `prompt.executeTools()`.

### 1. Implement the tool executor

Implement the tool interface generated for your template:

```dart
import 'package:my_app/gen/prompts.dart';

class ResearchExecutor implements ToolExecutor_WebSearch {
  @override
  Future<WebSearch_Output> webSearch(WebSearch_Input input) async {
    final results = await searchService(input.query);
    return WebSearch_Output(
      results: results.map((r) => WebSearch_Output_Results(
        title: r.title,
        url: r.url,
        snippet: r.snippet,
      )).toList(),
    );
  }
}
```

### 2. Dispatch tool calls

Pass tool calls returned by the LLM to `prompt.executeTools()`:

```dart
import 'dart:convert';
import 'package:my_app/gen/prompts.dart';

final toolCalls = [
  ToolCall(
    callId: "call_123",
    toolName: "webSearch",
    stringifiedInput: jsonEncode({"query": "TypePrompt"}),
  ),
];

final responses = await prompt.executeTools(toolCalls, ResearchExecutor());

for (final resp in responses) {
  print(resp.callId);            // "call_123"
  print(resp.stringifiedOutput); // JSON output string
}
```

`executeTools` executes matching tool functions concurrently without throwing unhandled exceptions. If a tool implementation throws an error, it captures the error and returns a `ToolCallResponse`:

- `resp.callId`: The matching call ID.
- `resp.stringifiedOutput`: Serialized JSON output on success, or `{"error": "<message>"}` on failure (ready to forward directly to OpenAI / Gemini).
- `resp.error`: Plain error message string if execution failed, or `null` on success (useful for Anthropic's `is_error` flag).

If a template has no tools, pass `noTools` as the executor.

### 3. Type-safe tool names

TypePrompt generates `PromptTools` enums for each template's tools, providing compile-time safety when referencing tool names (e.g., configuring tool choice):

```dart
final toolName = PromptTools_ResearchQuestion.webSearch.toolName;  // "webSearch"
```

---

## Type definitions

All types declared in your TypePrompt schemas are emitted with descriptive prefixed names:

```dart
import 'package:my_app/gen/prompts.dart';

// Template inputs & outputs
typedef TriageInput = TriageTicket_Input;
typedef TriageOutput = TriageTicket_Output;
typedef TicketCategory = TriageTicket_TicketCategory;

// Tool inputs & outputs
typedef SearchInput = WebSearch_Input;
typedef SearchOutput = WebSearch_Output;

// Metadata type
typedef Meta = Meta_Meta;
```

### Generated data classes

TypePrompt generates a `final class` for each interface declared in your schema. Instances are constructed using Dart's idiomatic named constructor parameters:

```dart
final input = TriageTicket_Input(
  subject: "Bug report",
  body: "Crashes on startup",
  customerTier: TriageTicket_Input_CustomerTier.pro,
  recentTickets: [
    TriageTicket_RecentTicket(id: "T-101", status: "closed"),
  ],
);
```

#### Rules & behavior

- **Named parameters**: Every non-literal field is declared as a named parameter in the constructor.
- **Required vs. optional**: Non-optional schema fields use `required` parameters (e.g. `required this.subject`). Optional fields are nullable (`String?`) and can be omitted during construction (defaulting to `null`).
- **Literal fields**: Fields whose type is a literal value (e.g. `"success"` or `true`) are omitted from the constructor.
- **Immutability**: All fields are declared `final`.

### String unions (enums)

String unions generate native Dart `enum` types with values mapped to idiomatic camelCase:

```dart
enum TriageTicket_TicketCategory {
  bug,
  featureRequest,
  billing,
  other;

  String toJson() { ... }
  factory TriageTicket_TicketCategory.fromJson(String value) { ... }
}
```

Call `.toJson()` on an enum value to retrieve its string value.

### Discriminated unions

Discriminated unions generate a `sealed class`:

```dart
/// A node in the rendered page tree.
sealed class GeneratePageTree_PageNode {
  Map<String, dynamic> toJson();
  factory GeneratePageTree_PageNode.fromJson(Map<String, dynamic> json);
}
```

#### Pattern matching with `switch`

Because the base class is `sealed`, Dart 3 enables exhaustive pattern matching with `switch` without requiring a `default` case:

```dart
final summary = switch (node) {
  GeneratePageTree_PageNode_KindHeading heading =>
    "Heading (H${heading.level.toJson()}): ${heading.text}",
  GeneratePageTree_PageNode_KindParagraph paragraph =>
    "Paragraph: ${paragraph.text}",
  GeneratePageTree_PageNode_KindButton button =>
    "Button: ${button.label} (${button.url})",
  GeneratePageTree_PageNode_KindSection section =>
    "Section: ${section.title ?? '(untitled)'} (${section.children.length} items)",
};
```

### JSON serialization & deserialization

While `render*` and `parseResponse` handle JSON conversion automatically during prompt execution, all generated classes and unions provide `.toJson()` and `fromJson()` methods for manual serialization and deserialization (e.g. for logging, caching, or disk storage).

### Multi-namespace projects

When your project defines `<namespace>` blocks other than `Main`, templates and types are prefixed by their namespace name:

```dart
import 'package:my_app/gen/prompts.dart';

// Render templates from specific namespaces
final financePrompt = prompts.finance.renderSummarizeTransaction(
  Finance_SummarizeTransaction_Input(
    description: "Server invoice",
    amount: Finance_Shared_MoneyAmount(value: 120.0, currency: Finance_Shared_Currency.usd),
  ),
);

final legalPrompt = prompts.legal.renderDraftNda(
  Legal_DraftNda_Input(
    disclosingParty: Legal_Shared_Party(name: "Acme Corp", role: Legal_Shared_Party_Role.client, jurisdiction: "CA"),
    receivingParty: Legal_Shared_Party(name: "Beta LLC", role: Legal_Shared_Party_Role.counterparty, jurisdiction: "DE"),
  ),
);
```

---

## End-to-end OpenAI example

Here is a complete, production-ready example defining a generic `executePrompt` function integrating TypePrompt with the OpenAI HTTP API:

```dart
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:my_app/gen/prompts.dart';

/**
 * Generic helper to execute any TypePrompt prompt with OpenAI.
 */
Future<Output> executePrompt<Output, ToolExecutor>(
  Prompt<Output, ToolExecutor> prompt,
  ToolExecutor toolExecutor, {
  String apiKey = "YOUR_OPENAI_API_KEY",
}) async {
  // 1. Prepare tools for OpenAI from prompt.tools
  final tools = prompt.tools.values.map((t) => {
    "type": "function",
    "function": {
      "name": t.name,
      "description": t.description,
      "parameters": t.inputJsonSchema,
    },
  }).toList();

  // 2. Format initial messages
  final messages = <Map<String, dynamic>>[
    {"role": "system", "content": prompt.systemMessage},
    for (final ex in prompt.examples) ...[
      {"role": "user", "content": ex.userMessage},
      {"role": "assistant", "content": ex.response},
    ],
    {"role": "user", "content": prompt.userMessage},
  ];

  // 3. Tool execution & completion loop
  while (true) {
    final responseFormat = prompt.outputFormat is JsonOutputFormat
        ? {
            "type": "json_schema",
            "json_schema": {
              "name": "output",
              "strict": true,
              "schema": (prompt.outputFormat as JsonOutputFormat).jsonSchema,
            },
          }
        : null;

    final requestBody = {
      "model": "gpt-4o",
      "messages": messages,
      if (tools.isNotEmpty) "tools": tools,
      if (responseFormat != null) "response_format": responseFormat,
    };

    final httpResponse = await http.post(
      Uri.parse("https://api.openai.com/v1/chat/completions"),
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer $apiKey",
      },
      body: jsonEncode(requestBody),
    );

    final data = jsonDecode(httpResponse.body) as Map<String, dynamic>;
    final choices = data["choices"] as List?;
    if (choices == null || choices.isEmpty) {
      throw Exception("No choices returned: ${httpResponse.body}");
    }
    final choice = choices.first as Map<String, dynamic>;
    final message = choice["message"] as Map<String, dynamic>;
    messages.add(message);

    // If the model requested tool calls, execute them with prompt.executeTools()
    final rawToolCalls = message["tool_calls"] as List?;
    if (rawToolCalls != null && rawToolCalls.isNotEmpty) {
      final toolCallsToExecute = rawToolCalls.map((tc) => ToolCall(
        callId: tc["id"] as String,
        toolName: tc["function"]["name"] as String,
        stringifiedInput: tc["function"]["arguments"] as String,
      ));

      final toolResults = await prompt.executeTools(toolCallsToExecute, toolExecutor);

      for (final result in toolResults) {
        messages.add({
          "role": "tool",
          "tool_call_id": result.callId,
          "content": result.stringifiedOutput,
        });
      }
      continue;
    }

    // Final response: parse and validate into typed Output
    final content = message["content"] as String? ?? "";
    return prompt.parseResponse(content);
  }
}

// --- Usage ---

void main() async {
  // 1. Render the prompt
  final prompt = prompts.renderResearchQuestion(
    ResearchQuestion_Input(question: "What is TypePrompt?"),
  );

  // 2. Execute the prompt — the return value is strongly typed
  final result = await executePrompt(prompt, ResearchExecutor());
  print("Answer: ${result.answer}");
  print("Sources: ${result.sources}");
}
```
