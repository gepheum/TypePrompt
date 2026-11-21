---
title: C#
description: How to use TypePrompt-generated C# code in your application.
---

# C# integration guide

This guide explains how to use TypePrompt-generated C# code in your application.

---

## Installation & setup

TypePrompt generates clean, standalone C# (C# 10+) code that relies on these lightweight NuGet packages:

```bash
dotnet add package YamlDotNet
dotnet add package Toon.DotNet
```

In your `typeprompt.yaml` configuration file, specify your C# output path and optional root namespace:

```yaml
gen:
  csharp:
    file: src/Gen/Prompts.cs
    rootNamespace: MyCompany.Prompts
```

Generate the C# code:

```bash
bunx @typeprompt/cli gen
```

---

## Quick start

Import the generated namespace and call the template render method on `Prompts.Default`:

```csharp
using MyCompany.Prompts;

var prompt = Prompts.Default.RenderTranslate(new Schema.Translate.Input
{
    Text = "Hello world",
    TargetLanguage = "French"
});

Console.WriteLine(prompt.SystemMessage);
Console.WriteLine(prompt.UserMessage);
```

---

## The `Prompt` object

Calling a `Render*` method returns a `Prompt<TOutput, TToolExecutor>` object with everything needed to interact with an LLM:

| Property / Method | Description |
|---|---|
| `prompt.SystemMessage` | Rendered system prompt string. |
| `prompt.UserMessage` | Rendered user prompt string. |
| `prompt.Meta` | Typed metadata defined in the template (e.g., `Model`, `Temperature`). |
| `prompt.Examples` | List of few-shot examples (`FewShotExample`), if defined. |
| `prompt.Tools` | Dictionary of available tool definitions and their JSON schemas. |
| `prompt.OutputFormat` | Output descriptor (`JsonOutputFormat` with `JsonSchema`, or `TextOutputFormat`). |
| `prompt.ParseResponse(response)` | Parses and validates raw LLM response text into the typed `TOutput`. |
| `prompt.ExecuteTools(calls, executor, cancellationToken)` | Concurrently executes tool calls using your tool executor implementation. |

---

## Parsing LLM responses

Pass the LLM's response string to `prompt.ParseResponse()` to validate and parse it into your typed output:

```csharp
var rawModelOutput = response.Value.Content.FirstOrDefault()?.Text ?? "";

var result = prompt.ParseResponse(rawModelOutput);
// result is fully typed according to the template's output schema
```

- **JSON Outputs**: Automatically strips markdown code fences (`` ```json ... ``` ``) and deserializes the JSON using `System.Text.Json`.
- **Text Outputs**: Returns the raw text string directly as a `string`.

---

## Executing tools

When a template defines `<tools>`, implement the tool executor interface and dispatch tool calls with `prompt.ExecuteTools()`.

### 1. Implement the tool executor

Implement the tool interface generated for your template:

```csharp
using MyCompany.Prompts;

public class ResearchExecutor : ToolExecutor.IWebSearch
{
    public async Task<Schema.WebSearch.Output> WebSearch(
        Schema.WebSearch.Input input,
        CancellationToken cancellationToken = default
    )
    {
        var results = await SearchServiceAsync(input.Query, cancellationToken);
        return new Schema.WebSearch.Output
        {
            Results = results.Select(r => new Schema.WebSearch.Output_Results
            {
                Title = r.Title,
                Url = r.Url,
                Snippet = r.Snippet
            }).ToList()
        };
    }
}
```

### 2. Dispatch tool calls

Pass tool calls returned by the LLM to `prompt.ExecuteTools()`:

```csharp
using System.Text.Json;
using MyCompany.Prompts;

var toolCalls = new[]
{
    new ToolCall("call_123", "webSearch", JsonSerializer.Serialize(new { query = "TypePrompt" }))
};

var responses = await prompt.ExecuteTools(toolCalls, new ResearchExecutor());

for (var resp in responses)
{
    Console.WriteLine(resp.CallId);            // "call_123"
    Console.WriteLine(resp.StringifiedOutput); // JSON output string
}
```

`ExecuteTools` executes matching tool functions concurrently without throwing unhandled exceptions. If a tool implementation throws an exception, it captures the error and returns a `ToolCallResponse`:

- `resp.CallId`: The matching call ID.
- `resp.StringifiedOutput`: Serialized JSON output on success, or `{"error": "<message>"}` on failure (ready to forward directly to OpenAI / Gemini).
- `resp.Error`: Plain error message string if execution failed, or `null` on success (useful for Anthropic's `is_error` flag).

If a template has no tools, pass `NoTools.NoTools` as the executor.

### 3. Type-safe tool names

TypePrompt generates a `PromptTools` class with enums for each template's tools, providing compile-time safety when referencing tool names (e.g., configuring tool choice):

```csharp
var toolName = PromptTools.ResearchQuestion.WebSearch.GetToolName();  // "webSearch"
```

---

## Type definitions and `Schema`

All types declared in your TypePrompt schemas are exported inside the `Schema` class:

```csharp
using MyCompany.Prompts;

// Template inputs & outputs
using TriageInput = MyCompany.Prompts.Schema.TriageTicket.Input;
using TriageOutput = MyCompany.Prompts.Schema.TriageTicket.Output;
using TicketCategory = MyCompany.Prompts.Schema.TriageTicket.TicketCategory;

// Tool inputs & outputs
using SearchInput = MyCompany.Prompts.Schema.WebSearch.Input;
using SearchOutput = MyCompany.Prompts.Schema.WebSearch.Output;

// Metadata type
using Meta = MyCompany.Prompts.Schema.Meta.Meta;
```

### Generated records

TypePrompt generates a `public sealed record` for each interface declared in your schema. Instances are constructed using C#'s object initializer syntax:

```csharp
var input = new Schema.TriageTicket.Input
{
    Subject = "Bug report",
    Body = "Crashes on startup",
    CustomerTier = Schema.TriageTicket.Input_CustomerTier.Pro,
    RecentTickets = [
        new Schema.TriageTicket.Input_RecentTickets
        {
            Id = "T-101",
            Summary = "Cannot login",
            Category = Schema.TriageTicket.TicketCategory.Billing,
        },
    ],
};
```

#### Rules & behavior

- **Object initializers**: Properties should be initialized using C#'s object initializer syntax.
- **Required vs. optional**: Non-optional schema fields are declared as `required` properties (e.g. `public required string Subject { get; init; }`), requiring them at initialization. Optional fields are nullable (`T?`) without `required` and can be omitted.
- **Literal fields**: Fields whose type is a literal value (e.g. `"success"` or `true`) are omitted from object initialization.
- **Immutability**: Generated records use `{ get; init; }` properties.

### String unions (enums)

String unions generate C# `enum` types with values mapped to PascalCase:

```csharp
[JsonConverter(typeof(JsonStringEnumConverter))]
public enum TicketCategory
{
    [JsonStringEnumMemberName("billing")]
    Billing,
    [JsonStringEnumMemberName("technical-issue")]
    TechnicalIssue,
    [JsonStringEnumMemberName("feature-request")]
    FeatureRequest,
    [JsonStringEnumMemberName("other")]
    Other,
}
```

An extension method `.GetValue()` is generated to retrieve the string value:

```csharp
var category = Schema.TriageTicket.TicketCategory.Billing;
Console.WriteLine(category.GetValue()); // "billing"
```

### Discriminated unions

Discriminated unions generate an `interface` implemented by each variant record:

```csharp
/// <summary>
/// A node in the rendered page tree.
/// </summary>
[JsonConverter(typeof(PageNode__Converter))]
public interface PageNode
{
}
```

#### Pattern matching with `switch`

C# pattern matching enables clean switching over the interface variants:

```csharp
var summary = node switch
{
    Schema.GeneratePageTree.PageNode_KindHeading heading =>
        $"Heading (H{heading.Level}): {heading.Text}",
    Schema.GeneratePageTree.PageNode_KindParagraph paragraph =>
        $"Paragraph: {paragraph.Text}",
    Schema.GeneratePageTree.PageNode_KindButton button =>
        $"Button: {button.Label} ({button.Url})",
    Schema.GeneratePageTree.PageNode_KindSection section =>
        $"Section: {section.Title ?? "(untitled)"} ({section.Children.Count} items)",
    _ => throw new InvalidOperationException()
};
```

### JSON serialization & deserialization

While `prompt.Render*` and `prompt.ParseResponse` handle JSON conversion automatically during prompt execution, all generated types integrate with `System.Text.Json.JsonSerializer` for manual serialization and deserialization (e.g. for logging, caching, or IPC).

### Multi-namespace projects

When your project defines `<namespace>` blocks other than `Main`, templates and schemas are organized under their namespace:

```csharp
using MyCompany.Prompts;

// Render templates from specific namespaces
var financePrompt = Prompts.Default.Finance.RenderSummarizeTransaction(new Schema.Finance.SummarizeTransaction.Input
{
    Description = "Server invoice",
    Amount = new Schema.Finance.Shared.Amount { Value = 120, Currency = "USD" }
});

var legalPrompt = Prompts.Default.Legal.RenderDraftNda(new Schema.Legal.DraftNda.Input
{
    DisclosingParty = "Acme Corp",
    ReceivingParty = "Beta LLC"
});
```

---

## End-to-end OpenAI example

Here is a complete, production-ready example defining a generic `ExecutePrompt` function integrating TypePrompt with the official OpenAI .NET SDK (`OpenAI.Chat`):

```csharp
using System.Text.Json;
using OpenAI.Chat;
using MyCompany.Prompts;

public static class LlmHelper
{
    /// <summary>
    /// Generic helper to execute any TypePrompt prompt with OpenAI.
    /// </summary>
    public static async Task<TOutput> ExecutePrompt<TOutput, TToolExecutor>(
        ChatClient chatClient,
        Prompt<TOutput, TToolExecutor> prompt,
        TToolExecutor toolExecutor,
        CancellationToken cancellationToken = default
    )
    {
        // 1. Prepare tools for OpenAI from prompt.Tools
        var tools = prompt.Tools.Values.Select(t => ChatTool.CreateFunctionTool(
            functionName: t.Name,
            functionDescription: t.Description,
            functionParameters: BinaryData.FromString(JsonSerializer.Serialize(t.InputJsonSchema))
        )).ToList();

        // 2. Format initial messages
        var messages = new List<ChatMessage>
        {
            new SystemChatMessage(prompt.SystemMessage)
        };

        foreach (var example in prompt.Examples)
        {
            messages.Add(new UserChatMessage(example.UserMessage));
            messages.Add(new AssistantChatMessage(example.Response));
        }

        messages.Add(new UserChatMessage(prompt.UserMessage));

        var options = new ChatCompletionOptions();
        foreach (var tool in tools)
        {
            options.Tools.Add(tool);
        }

        if (prompt.OutputFormat is JsonOutputFormat jsonFormat)
        {
            options.ResponseFormat = ChatResponseFormat.CreateJsonSchemaFormat(
                jsonSchemaFormatName: "output",
                jsonSchema: BinaryData.FromString(JsonSerializer.Serialize(jsonFormat.JsonSchema)),
                jsonSchemaIsStrict: true
            );
        }

        // 3. Tool execution & completion loop
        while (true)
        {
            var completion = await chatClient.CompleteChatAsync(messages, options, cancellationToken);
            messages.Add(new AssistantChatMessage(completion.Value));

            // If the model requested tool calls, execute them with prompt.ExecuteTools()
            if (completion.Value.ToolCalls.Count > 0)
            {
                var toolCallsToExecute = completion.Value.ToolCalls.Select(tc => new ToolCall(
                    tc.Id,
                    tc.FunctionName,
                    tc.FunctionArguments.ToString()
                ));

                var toolResults = await prompt.ExecuteTools(toolCallsToExecute, toolExecutor, cancellationToken);

                foreach (var result in toolResults)
                {
                    messages.Add(new ToolChatMessage(result.CallId, result.StringifiedOutput));
                }
                continue;
            }

            // Final response: parse and validate into typed TOutput
            var content = completion.Value.Content[0].Text ?? "";
            return prompt.ParseResponse(content);
        }
    }
}

// --- Usage ---

public class Program
{
    public static async Task Main()
    {
        var chatClient = new ChatClient("gpt-4o", Environment.GetEnvironmentVariable("OPENAI_API_KEY"));

        // 1. Render the prompt
        var prompt = Prompts.Default.RenderResearchQuestion(new Schema.ResearchQuestion.Input
        {
            Question = "What is TypePrompt?"
        });

        // 2. Execute the prompt — the return value is strongly typed
        var result = await LlmHelper.ExecutePrompt(chatClient, prompt, new ResearchExecutor());
        Console.WriteLine($"Answer: {result.Answer}");
        Console.WriteLine($"Sources: {string.Join(", ", result.Sources)}");
    }
}
```
