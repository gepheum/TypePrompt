# Swift integration guide

This guide explains how to use TypePrompt-generated Swift code in your application.

---

## Installation & setup

TypePrompt generates clean, standalone Swift (Swift 5.9+) code that relies on these lightweight Swift package dependencies:

In your `Package.swift`:

```swift
dependencies: [
    .package(url: "https://github.com/jpsim/Yams.git", from: "5.0.0"),
    .package(url: "https://github.com/toon-format/toon-swift.git", from: "0.3.0"),
]
```

In your `typeprompt.yaml` configuration file, specify your Swift output path and optional root namespace:

```yaml
gen:
  swift:
    file: Sources/Gen/Prompts.swift
    rootNamespace: MyPrompts
```

Generate the Swift code:

```bash
npx typeprompt gen
```

---

## Quick start

Import the generated module and call the template render method on `prompts`:

```swift
import MyPrompts

let prompt = prompts.renderTranslate(
    Schema.Translate.Input(
        text: "Hello world",
        targetLanguage: "French"
    )
)

print(prompt.systemMessage)
print(prompt.userMessage)
```

---

## The `Prompt` object

Calling a `render*` method returns a `Prompt<Output, ToolExecutor>` object with everything needed to interact with an LLM:

| Property / Method | Description |
|---|---|
| `prompt.systemMessage` | Rendered system prompt string. |
| `prompt.userMessage` | Rendered user prompt string. |
| `prompt.meta` | Typed metadata defined in the template (e.g., `model`, `temperature`). |
| `prompt.examples` | List of few-shot examples (`[FewShotExample]`), if defined. |
| `prompt.tools` | Dictionary of available tool definitions and their JSON schemas. |
| `prompt.outputFormat` | Output descriptor (`.json(let format)` with `jsonSchema`, or `.text`). |
| `prompt.parseResponse(response)` | Parses and validates raw LLM response text into the typed `Output`. |
| `prompt.executeTools(calls, toolExecutor: executor)` | Concurrently executes tool calls using your tool executor implementation. |

---

## Parsing LLM responses

Pass the LLM's response string to `prompt.parseResponse()` to validate and parse it into your typed output:

```swift
let rawModelOutput = response.choices.first?.message.content ?? ""

let result = try prompt.parseResponse(rawModelOutput)
// result is fully typed according to the template's output schema
```

- **JSON Outputs**: Automatically strips markdown code fences (`` ```json ... ``` ``) and decodes the JSON using `JSONDecoder`.
- **Text Outputs**: Returns the raw text string directly as a `String`.

---

## Executing tools

When a template defines `<tools>`, implement the tool executor protocol and dispatch tool calls with `prompt.executeTools()`.

### 1. Implement the tool executor

Implement the tool protocol generated for your template:

```swift
import MyPrompts

struct ResearchExecutor: ToolExecutor.WebSearch {
    func webSearch(
        input: Schema.WebSearch.Input
    ) async throws -> Schema.WebSearch.Output {
        let results = try await searchService(input.query)
        return Schema.WebSearch.Output(
            results: results.map { r in
                Schema.WebSearch.Output_Results(
                    title: r.title,
                    url: r.url,
                    snippet: r.snippet
                )
            }
        )
    }
}
```

### 2. Dispatch tool calls

Pass tool calls returned by the LLM to `prompt.executeTools()`:

```swift
import MyPrompts

let toolCalls = [
    ToolCall(
        callId: "call_123",
        toolName: "webSearch",
        stringifiedInput: "{\"query\":\"TypePrompt\"}"
    )
]

let responses = await prompt.executeTools(toolCalls, toolExecutor: ResearchExecutor())

for resp in responses {
    print(resp.callId)            // "call_123"
    print(resp.stringifiedOutput) // JSON output string
}
```

`executeTools` executes matching tool functions concurrently without throwing unhandled exceptions. If a tool implementation throws an error, it captures the error and returns a `ToolCallResponse`:

- `resp.callId`: The matching call ID.
- `resp.stringifiedOutput`: Serialized JSON output on success, or `{"error": "<message>"}` on failure (ready to forward directly to OpenAI / Gemini).
- `resp.error`: Plain error message string if execution failed, or `nil` on success (useful for Anthropic's `is_error` flag).

If a template has no tools, pass `noTools` as the executor.

### 3. Type-safe tool names

TypePrompt generates a `PromptTools` enum containing tool cases for each template, providing compile-time safety when referencing tool names (e.g., configuring tool choice):

```swift
let toolName = PromptTools.ResearchQuestion.webSearch.toolName  // "webSearch"
```

---

## Type definitions and `Schema`

All types declared in your TypePrompt schemas are exported inside the `Schema` enum:

```swift
import MyPrompts

// Template inputs & outputs
typealias TriageInput = Schema.TriageTicket.Input
typealias TriageOutput = Schema.TriageTicket.Output
typealias TicketCategory = Schema.TriageTicket.TicketCategory

// Tool inputs & outputs
typealias SearchInput = Schema.WebSearch.Input
typealias SearchOutput = Schema.WebSearch.Output

// Metadata type
typealias Meta = Schema.Meta.Meta
```

### Generated structs

TypePrompt generates a `public struct` conforming to `Codable` and `Sendable` for each interface declared in your schema. Instances are constructed using Swift's memberwise initializer with named arguments:

```swift
let input = Schema.TriageTicket.Input(
    subject: "Bug report",
    body: "Crashes on startup",
    customerTier: .pro,
    recentTickets: [
        Schema.TriageTicket.Input_RecentTickets(
            id: "T-101",
            summary: "Cannot login",
            category: .billing
        ),
    ]
)
```

#### Rules & behavior

- **Named parameters**: Every non-literal field is declared as a parameter in the initializer.
- **Required vs. optional**: Non-optional schema fields are required in `init`. Optional fields are typed as optionals (`T?`) and default to `nil` (e.g. `suggestedReply: String? = nil`), allowing them to be omitted during initialization.
- **Literal fields**: Fields whose type is a literal value (e.g. `"success"` or `true`) are omitted from the initializer.
- **Immutability**: All struct properties are declared `let`.

### String unions (enums)

String unions generate Swift `enum` types conforming to `String`, `Codable`, and `Sendable` with cases mapped to camelCase:

```swift
public enum TicketCategory : String, Codable, Sendable {
    case billing = "billing"
    case technicalIssue = "technical-issue"
    case featureRequest = "feature-request"
    case other = "other"
}
```

Access `.rawValue` to retrieve the string value:

```swift
let category = Schema.TriageTicket.TicketCategory.billing
print(category.rawValue) // "billing"
```

### Discriminated unions

Discriminated unions generate an `enum` conforming to `Codable` and `Sendable` with an associated value for each variant:

```swift
/// A node in the rendered page tree.
indirect public enum PageNode : Codable, Sendable {
    case kindHeading(PageNode_KindHeading)
    case kindParagraph(PageNode_KindParagraph)
    case kindButton(PageNode_KindButton)
    case kindSection(PageNode_KindSection)
}
```

### JSON serialization & deserialization

While `prompt.render*` and `prompt.parseResponse` handle JSON conversion automatically during prompt execution, all generated types conform to `Codable` for standalone serialization and deserialization using Foundation's `JSONEncoder` and `JSONDecoder`.

### Multi-namespace projects

When your project defines `<namespace>` blocks other than `Main`, templates and schemas are organized under their namespace:

```swift
import MyPrompts

// Render templates from specific namespaces
let financePrompt = prompts.finance.renderSummarizeTransaction(
    Schema.Finance.SummarizeTransaction.Input(
        description: "Server invoice",
        amount: Schema.Finance.Shared.Amount(value: 120.0, currency: "USD")
    )
)

let legalPrompt = prompts.legal.renderDraftNda(
    Schema.Legal.DraftNda.Input(
        disclosingParty: "Acme Corp",
        receivingParty: "Beta LLC"
    )
)
```

---

## End-to-end OpenAI example

Here is a complete, production-ready example defining a generic `executePrompt` function integrating TypePrompt with the OpenAI HTTP API:

```swift
import Foundation
import MyPrompts

/**
 * Generic helper to execute any TypePrompt prompt with OpenAI.
 */
func executePrompt<Output, ToolExecutor>(
    prompt: Prompt<Output, ToolExecutor>,
    toolExecutor: ToolExecutor,
    apiKey: String = ProcessInfo.processInfo.environment["OPENAI_API_KEY"] ?? ""
) async throws -> Output {
    // 1. Prepare tools for OpenAI from prompt.tools
    let tools: [[String: Any]] = try prompt.tools.values.map { t in
        [
            "type": "function",
            "function": [
                "name": t.name,
                "description": t.description,
                "parameters": try jsonElementToAny(t.inputJsonSchema)
            ]
        ]
    }

    // 2. Format initial messages
    var messages: [[String: Any]] = [
        ["role": "system", "content": prompt.systemMessage]
    ]

    for example in prompt.examples {
        messages.append(["role": "user", "content": example.userMessage])
        messages.append(["role": "assistant", "content": example.response])
    }

    messages.append(["role": "user", "content": prompt.userMessage])

    // 3. Tool execution & completion loop
    while true {
        var requestBody: [String: Any] = [
            "model": "gpt-4o",
            "messages": messages
        ]

        if !tools.isEmpty {
            requestBody["tools"] = tools
        }

        if case .json(let format) = prompt.outputFormat {
            requestBody["response_format"] = [
                "type": "json_schema",
                "json_schema": [
                    "name": "output",
                    "strict": true,
                    "schema": try jsonElementToAny(format.jsonSchema)
                ]
            ]
        }

        var request = URLRequest(url: URL(string: "https://api.openai.com/v1/chat/completions")!)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONSerialization.data(withJSONObject: requestBody)

        let (data, _) = try await URLSession.shared.data(for: request)
        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let choices = json["choices"] as? [[String: Any]],
              let choice = choices.first,
              let message = choice["message"] as? [String: Any] else {
            throw URLError(.cannotParseResponse)
        }

        messages.append(message)

        // If the model requested tool calls, execute them with prompt.executeTools()
        if let rawToolCalls = message["tool_calls"] as? [[String: Any]], !rawToolCalls.isEmpty {
            let toolCallsToExecute = rawToolCalls.compactMap { tc -> ToolCall? in
                guard let id = tc["id"] as? String,
                      let fn = tc["function"] as? [String: Any],
                      let name = fn["name"] as? String,
                      let args = fn["arguments"] as? String else { return nil }
                return ToolCall(callId: id, toolName: name, stringifiedInput: args)
            }

            let toolResults = try await prompt.executeTools(toolCallsToExecute, toolExecutor: toolExecutor)

            for result in toolResults {
                messages.append([
                    "role": "tool",
                    "tool_call_id": result.callId,
                    "content": result.stringifiedOutput
                ])
            }
            continue
        }

        // Final response: parse and validate into typed Output
        let content = message["content"] as? String ?? ""
        return try prompt.parseResponse(content)
    }
}

func jsonElementToAny(_ elem: Prompts.JsonElement) throws -> Any {
    let data = try JSONEncoder().encode(elem)
    return try JSONSerialization.jsonObject(with: data)
}

// --- Usage ---

@main
struct App {
    static func main() async throws {
        // 1. Render the prompt
        let prompt = prompts.renderResearchQuestion(
            Schema.ResearchQuestion.Input(question: "What is TypePrompt?")
        )

        // 2. Execute the prompt — the return value is strongly typed
        let result = try await executePrompt(prompt: prompt, toolExecutor: ResearchExecutor())
        print("Answer: \(result.answer)")
        print("Sources: \(result.sources)")
    }
}
```
