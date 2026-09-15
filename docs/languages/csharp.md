# C# Integration Guide

This guide explains how to use TypePrompt-generated C# code in your application.

---

## Installation & Setup

TypePrompt generates clean, standalone C# (C# 10+) code that relies on two lightweight NuGet packages:

```bash
dotnet add package YamlDotNet
dotnet add package Toon.DotNet
```

In your `typeprompt.json` configuration file, specify your C# output path and optional root namespace:

```json
{
  "gen": {
    "csharp": {
      "file": "src/Gen/Prompts.cs",
      "rootNamespace": "MyCompany.Prompts"
    }
  }
}
```

Generate the C# code:

```bash
npx typeprompt gen
```

---

## Quick Start

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

## The `Prompt` Object

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

## Parsing LLM Responses

Pass the LLM's response string to `prompt.ParseResponse()` to validate and parse it into your typed output:

```csharp
var rawModelOutput = response.Value.Content.FirstOrDefault()?.Text ?? "";

var result = prompt.ParseResponse(rawModelOutput);
// result is fully typed according to the template's output schema
```

- **JSON Outputs**: Automatically strips markdown code fences (`` ```json ... ``` ``) and deserializes the JSON using `System.Text.Json`.
- **Text Outputs**: Returns the raw text string directly as a `string`.

---

## Executing Tools

When a template defines `<tools>`, implement the tool executor interface and dispatch tool calls with `prompt.ExecuteTools()`.

### 1. Implement the Tool Executor

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

### 2. Dispatch Tool Calls

Pass tool calls returned by the LLM (as an array, list, or any `IEnumerable<ToolCall>`) to `prompt.ExecuteTools()`:

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

`ExecuteTools` executes the matching tool functions concurrently and returns formatted responses ready to send back to the LLM. If a template has no tools, pass `NoTools.NoTools` as the executor.

---

## Type Definitions and `Schema`

All types declared in your TypePrompt schemas are exported inside the `Schema` class:

```csharp
using MyCompany.Prompts;

// Template inputs & outputs
using TriageInput = MyCompany.Prompts.Schema.TriageTicket.Input;
using TriageOutput = MyCompany.Prompts.Schema.TriageTicket.Output;
using Priority = MyCompany.Prompts.Schema.TriageTicket.Priority;

// Tool inputs & outputs
using SearchInput = MyCompany.Prompts.Schema.WebSearch.Input;
using SearchOutput = MyCompany.Prompts.Schema.WebSearch.Output;

// Metadata type
using Meta = MyCompany.Prompts.Schema.Meta.Meta;
```

### Multi-Namespace Projects

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

## End-to-End OpenAI Example

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
