---
title: Kotlin
description: How to use TypePrompt-generated Kotlin code in your application.
---

# Kotlin integration guide

This guide explains how to use TypePrompt-generated Kotlin code in your application.

---

## Installation & setup

TypePrompt generates clean, standalone Kotlin code that relies on these lightweight runtime dependencies:

In your `build.gradle.kts`:

```kotlin
dependencies {
    implementation("org.yaml:snakeyaml:2.2")
    implementation("dev.toonformat:jtoon:2.0.2")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.8.0")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.6.3")
}
```

In your `typeprompt.yaml` configuration file, specify your Kotlin output path and package name:

```yaml
gen:
  kotlin:
    file: src/main/kotlin/gen/Prompts.kt
    package: com.example.prompts
```

Generate the Kotlin code:

```bash
npx typeprompt gen
```

---

## Quick start

Import the `prompts` object and call the template render method with your typed input:

```kotlin
import com.example.prompts.prompts
import com.example.prompts.Schema

val prompt = prompts.renderTranslate(
    Schema.Translate.Input(
        text = "Hello world",
        targetLanguage = "French",
    )
)

println(prompt.systemMessage)
println(prompt.userMessage)
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

```kotlin
val rawModelOutput = response.choices.firstOrNull()?.message?.content ?: ""

val result = prompt.parseResponse(rawModelOutput)
// result is fully typed according to the template's output schema
```

- **JSON Outputs**: Automatically strips markdown code fences (`` ```json ... ``` ``) and deserializes the JSON using Kotlinx Serialization.
- **Text Outputs**: Returns the raw text string directly as a `String`.

---

## Executing tools

When a template defines `<tools>`, implement the tool executor interface and dispatch tool calls with `prompt.executeTools()`.

### 1. Implement the tool executor

Implement the tool interface generated for your template:

```kotlin
import com.example.prompts.Schema
import com.example.prompts.ToolExecutor

class ResearchExecutor : ToolExecutor.WebSearch {
    override suspend fun webSearch(
        input: Schema.WebSearch.Input,
    ): Schema.WebSearch.Output {
        val results = searchService(input.query)
        return Schema.WebSearch.Output(
            results = results.map { r ->
                Schema.WebSearch.Output_Results(
                    title = r.title,
                    url = r.url,
                    snippet = r.snippet,
                )
            }
        )
    }
}
```

### 2. Dispatch tool calls

Pass tool calls returned by the LLM to `prompt.executeTools()`:

```kotlin
import com.example.prompts.ToolCall

val toolCalls = listOf(
    ToolCall(
        callId = "call_123",
        toolName = "webSearch",
        stringifiedInput = """{"query":"TypePrompt"}""",
    ),
)

val responses = prompt.executeTools(toolCalls, ResearchExecutor())

for (resp in responses) {
    println(resp.callId)             // "call_123"
    println(resp.stringifiedOutput)  // JSON output string
}
```

`executeTools` executes matching tool functions concurrently without throwing unhandled exceptions. If a tool implementation throws an exception, it captures the error and returns a `ToolCallResponse`:

- `resp.callId`: The matching call ID.
- `resp.stringifiedOutput`: Serialized JSON output on success, or `{"error": "<message>"}` on failure (ready to forward directly to OpenAI / Gemini).
- `resp.error`: Plain error message string if execution failed, or `null` on success (useful for Anthropic's `is_error` flag).

If a template has no tools, pass `NoTools` as the executor.

### 3. Type-safe tool names

TypePrompt generates a `PromptTools` object with enums for each template's tools, providing compile-time safety when referencing tool names (e.g., configuring tool choice):

```kotlin
val toolName = PromptTools.ResearchQuestion.webSearch.toolName  // "webSearch"
```

---

## Type definitions and `Schema`

All types declared in your TypePrompt schemas are exported inside the `Schema` class:

```kotlin
import com.example.prompts.Schema

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

### Generated data classes

TypePrompt generates a `@Serializable data class` for each interface declared in your schema. Instances are constructed using Kotlin's standard constructor syntax with named arguments:

```kotlin
val input = Schema.TriageTicket.Input(
    subject = "Bug report",
    body = "Crashes on startup",
    customerTier = Schema.TriageTicket.Input_CustomerTier.Pro,
    recentTickets = listOf(
        Schema.TriageTicket.Input_RecentTickets(
            id = "T-101",
            summary = "Cannot login",
            category = Schema.TriageTicket.TicketCategory.Billing,
        ),
    ),
)
```

#### Rules & behavior

- **Named parameters**: Fields should be supplied using Kotlin's named argument syntax.
- **Required vs. optional**: Non-optional schema fields are required in the constructor. Optional fields are nullable (`T?`) and default to `null` (e.g. `val suggestedReply: String? = null`), allowing them to be omitted during construction.
- **Literal fields**: Fields whose type is a literal value (e.g. `"success"` or `true`) are omitted from the constructor.
- **Immutability**: All fields are declared `val`.

### String unions (enums)

String unions generate Kotlin `@Serializable enum class` types with values mapped to PascalCase:

```kotlin
enum class TicketCategory(val value: String) {
    @SerialName("billing")
    Billing("billing"),
    @SerialName("technical-issue")
    TechnicalIssue("technical-issue"),
    @SerialName("feature-request")
    FeatureRequest("feature-request"),
    @SerialName("other")
    Other("other");

    override fun toString(): String = value
}
```

### Discriminated unions

Discriminated unions generate a `@Serializable sealed interface`:

```kotlin
/// A node in the rendered page tree.
@Serializable(with = PageNode_Serializer::class)
sealed interface PageNode
```

#### Pattern matching with `when`

Because the base interface is `sealed`, Kotlin enables exhaustive pattern matching with `when` without requiring an `else` branch:

```kotlin
val summary = when (node) {
    is Schema.GeneratePageTree.PageNode_KindHeading ->
        "Heading (H${node.level.value}): ${node.text}"
    is Schema.GeneratePageTree.PageNode_KindParagraph ->
        "Paragraph: ${node.text}"
    is Schema.GeneratePageTree.PageNode_KindButton ->
        "Button: ${node.label} (${node.url})"
    is Schema.GeneratePageTree.PageNode_KindSection ->
        "Section: ${node.title ?: "(untitled)"} (${node.children.size} items)"
}
```

### JSON serialization & deserialization

While `prompt.render*` and `prompt.parseResponse` handle JSON conversion automatically during prompt execution, all generated types integrate with standard `kotlinx.serialization` for standalone serialization and deserialization (e.g. for logging, caching, or IPC).

### Multi-namespace projects

When your project defines `<namespace>` blocks other than `Main`, templates and schemas are organized under their namespace:

```kotlin
import com.example.prompts.prompts
import com.example.prompts.Schema

// Render templates from specific namespaces
val financePrompt = prompts.finance.renderSummarizeTransaction(
    Schema.Finance.SummarizeTransaction.Input(
        description = "Server invoice",
        amount = Schema.Finance.Shared.Amount(value = 120.0, currency = "USD"),
    )
)

val legalPrompt = prompts.legal.renderDraftNda(
    Schema.Legal.DraftNda.Input(
        disclosingParty = "Acme Corp",
        receivingParty = "Beta LLC",
    )
)

// Types are nested under their namespace
typealias FinanceInput = Schema.Finance.SummarizeTransaction.Input
typealias LegalInput = Schema.Legal.DraftNda.Input
```

---

## End-to-end OpenAI example

Here is a complete, production-ready example defining a generic `executePrompt` function integrating TypePrompt with the OpenAI Java / Kotlin SDK:

```kotlin
import com.example.prompts.*
import com.openai.client.OpenAIClient
import com.openai.models.*
import kotlinx.serialization.json.*

/**
 * Generic helper to execute any TypePrompt prompt with OpenAI.
 */
suspend fun <Output, ToolExecutor> executePrompt(
    client: OpenAIClient,
    prompt: Prompt<Output, ToolExecutor>,
    toolExecutor: ToolExecutor,
): Output {
    // 1. Prepare tools for OpenAI from prompt.tools
    val tools = prompt.tools.values.map { t ->
        ChatCompletionTool.builder()
            .type(ChatCompletionTool.Type.FUNCTION)
            .function(
                FunctionDefinition.builder()
                    .name(t.name)
                    .description(t.description)
                    .parameters(FunctionParameters.builder().putAllAdditionalProperties(t.inputJsonSchema).build())
                    .build()
            )
            .build()
    }

    // 2. Format initial messages
    val messages = mutableListOf<ChatCompletionMessageParam>()
    messages.add(ChatCompletionSystemMessageParam.builder().content(prompt.systemMessage).build())

    for (example in prompt.examples) {
        messages.add(ChatCompletionUserMessageParam.builder().content(example.userMessage).build())
        messages.add(ChatCompletionAssistantMessageParam.builder().content(example.response).build())
    }

    messages.add(ChatCompletionUserMessageParam.builder().content(prompt.userMessage).build())

    // 3. Tool execution & completion loop
    while (true) {
        val params = ChatCompletionCreateParams.builder()
            .model(ChatModel.GPT_4O)
            .messages(messages)
            .apply {
                if (tools.isNotEmpty()) tools(tools)
                if (prompt.outputFormat is JsonOutputFormat) {
                    val jsonFormat = prompt.outputFormat as JsonOutputFormat
                    responseFormat(
                        ResponseFormatJsonSchema.builder()
                            .jsonSchema(
                                ResponseFormatJsonSchema.JsonSchema.builder()
                                    .name("output")
                                    .strict(true)
                                    .schema(jsonFormat.jsonSchema)
                                    .build()
                            )
                            .build()
                    )
                }
            }
            .build()

        val response = client.chat().completions().create(params)
        val choice = response.choices().firstOrNull() ?: error("No choices returned by OpenAI")
        val message = choice.message()

        // If the model requested tool calls, execute them with prompt.executeTools()
        val toolCalls = message.toolCalls().orElse(emptyList())
        if (toolCalls.isNotEmpty()) {
            val toolCallsToExecute = toolCalls.map { tc ->
                ToolCall(
                    callId = tc.id(),
                    toolName = tc.function().name(),
                    stringifiedInput = tc.function().arguments(),
                )
            }

            val toolResults = prompt.executeTools(toolCallsToExecute, toolExecutor)

            for (result in toolResults) {
                messages.add(
                    ChatCompletionToolMessageParam.builder()
                        .toolCallId(result.callId)
                        .content(result.stringifiedOutput)
                        .build()
                )
            }
            continue
        }

        // Final response: parse and validate into typed Output
        val content = message.content().orElse("")
        return prompt.parseResponse(content)
    }
}

// --- Usage ---

suspend fun main() {
    val client = OpenAIClient.fromEnv()

    // 1. Render the prompt
    val prompt = prompts.renderResearchQuestion(
        Schema.ResearchQuestion.Input(question = "What is TypePrompt?")
    )

    // 2. Execute the prompt — the return value is strongly typed
    val result = executePrompt(client, prompt, ResearchExecutor())
    println("Answer: ${result.answer}")
    println("Sources: ${result.sources}")
}
```
