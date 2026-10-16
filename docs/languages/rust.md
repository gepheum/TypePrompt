# Rust integration guide

This guide explains how to use TypePrompt-generated Rust code in your application.

---

## Installation & setup

TypePrompt generates clean, standalone Rust code that relies on these lightweight dependencies:

In your `Cargo.toml`:

```toml
[dependencies]
futures = "0.3"
serde = { version = "1.0", features = ["derive"] }
serde_json = { version = "1.0", features = ["preserve_order"] }
serde_yaml = "0.9"
toon-format = { version = "0.5", default-features = false }
```

In your `typeprompt.yaml` configuration file, specify your Rust output path:

```yaml
gen:
  rust:
    file: src/gen/prompts.rs
```

Generate the Rust code:

```bash
npx typeprompt gen
```

---

## Quick start

Import the generated module and call the template render method on the `PROMPTS` static:

```rust
use crate::gen::prompts::{schema, PROMPTS};

let prompt = PROMPTS.render_translate(&schema::translate::Input {
    text: "Hello world".to_string(),
    target_language: "French".to_string(),
});

println!("{}", prompt.system_message);
println!("{}", prompt.user_message);
```

---

## The `Prompt` object

Calling a `render_*` method returns a `Prompt<Output, ToolExecutor>` object with everything needed to interact with an LLM:

| Property / Method | Description |
|---|---|
| `prompt.system_message` | Rendered system prompt string. |
| `prompt.user_message` | Rendered user prompt string. |
| `prompt.meta` | Typed metadata defined in the template (e.g., `model`, `temperature`). |
| `prompt.examples` | Vector of few-shot examples (`Vec<FewShotExample>`), if defined. |
| `prompt.tools` | Map of available tool definitions and their JSON schemas. |
| `prompt.output_format` | Output descriptor (`OutputFormat::Json` with `json_schema`, or `OutputFormat::TEXT`). |
| `prompt.parse_response(response)` | Parses and validates raw LLM response text into the typed `Output`. |
| `prompt.execute_tools(calls, executor).await` | Concurrently executes tool calls using your tool executor implementation. |

---

## Parsing LLM responses

Pass the LLM's response string to `prompt.parse_response()` to validate and parse it into your typed output:

```rust
let raw_model_output = response_message.content.as_deref().unwrap_or("");

let result = prompt.parse_response(raw_model_output)?;
// result is fully typed according to the template's output schema
```

- **JSON Outputs**: Automatically strips markdown code fences (`` ```json ... ``` ``) and deserializes the JSON using `serde_json`.
- **Text Outputs**: Returns the raw text string directly as a `String`.

---

## Executing tools

When a template defines `<tools>`, implement the tool executor trait and dispatch tool calls with `prompt.execute_tools()`.

### 1. Implement the tool executor

Implement the tool trait generated for your template:

```rust
use crate::gen::prompts::{schema, tool_executor};

struct ResearchExecutor;

impl tool_executor::WebSearch for ResearchExecutor {
    async fn web_search(
        &self,
        input: schema::web_search::Input,
    ) -> schema::web_search::Output {
        let results = search_service(&input.query).await;
        schema::web_search::Output {
            results: results
                .into_iter()
                .map(|r| schema::web_search::Output_Results {
                    title: r.title,
                    url: r.url,
                    snippet: r.snippet,
                })
                .collect(),
        }
    }
}
```

### 2. Dispatch tool calls

Pass tool calls returned by the LLM to `prompt.execute_tools()`:

```rust
use crate::gen::prompts::ToolCall;

let tool_calls = vec![
    ToolCall {
        call_id: "call_123".to_string(),
        tool_name: "webSearch".to_string(),
        stringified_input: serde_json::to_string(&serde_json::json!({
            "query": "TypePrompt"
        })).unwrap(),
    },
];

let responses = prompt.execute_tools(&tool_calls, &ResearchExecutor).await?;

for resp in responses {
    println!("{}", resp.call_id);             // "call_123"
    println!("{}", resp.stringified_output);  // JSON output string
}
```

`execute_tools` executes matching tool functions concurrently and returns a `ToolCallResponse` for each call:

- `resp.call_id`: The matching call ID.
- `resp.stringified_output`: Serialized JSON output on success, or `{"error": "<message>"}` on failure (ready to forward directly to OpenAI / Gemini).
- `resp.error`: Plain error message string if execution failed, or `None` on success (useful for Anthropic's `is_error` flag).

If a template has no tools, pass `&NO_TOOLS` as the executor.

### 3. Type-safe tool names

TypePrompt generates a `prompt_tools` module with enums for each template's tools, providing compile-time safety when referencing tool names (e.g., configuring tool choice):

```rust
let tool_name = prompt_tools::ResearchQuestion::WebSearch.tool_name();  // "webSearch"
```

---

## Type definitions and `schema`

All types declared in your TypePrompt schemas are exported inside the `schema` module:

```rust
use crate::gen::prompts::schema;

// Template inputs & outputs
type TriageInput = schema::triage_ticket::Input;
type TriageOutput = schema::triage_ticket::Output;
type TicketCategory = schema::triage_ticket::TicketCategory;

// Tool inputs & outputs
type SearchInput = schema::web_search::Input;
type SearchOutput = schema::web_search::Output;

// Metadata type
type Meta = schema::meta::Meta;
```

### Generated structs

TypePrompt generates a `pub struct` for each interface declared in your schema. Instances are constructed using standard Rust struct expression syntax:

```rust
let input = schema::triage_ticket::Input {
    subject: "Bug report".to_string(),
    body: "Crashes on startup".to_string(),
    customer_tier: schema::triage_ticket::Input_CustomerTier::Pro,
    recent_tickets: vec![
        schema::triage_ticket::Input_RecentTickets {
            id: "T-101".to_string(),
            summary: "Cannot login".to_string(),
            category: schema::triage_ticket::TicketCategory::Billing,
        },
    ],
};
```

#### Rules & behavior

- **Named fields**: Fields should be initialized using standard Rust struct expression syntax.
- **Required vs. optional**: Non-optional schema fields are required. Optional fields are typed as `Option<T>` (e.g. `suggested_reply: Option<String>`), requiring `None` or `Some(...)` when constructing the struct directly.
- **Literal fields**: Fields whose type is a literal value (e.g. `"success"` or `true`) are omitted from the struct definition.
- **Derives**: Structs automatically derive `Clone, serde::Serialize, serde::Deserialize, Debug, PartialEq`.

### String unions (enums)

String unions generate Rust `enum` types with variants mapped to PascalCase:

```rust
#[derive(Clone, serde::Serialize, serde::Deserialize, Debug, PartialEq)]
pub enum TicketCategory {
    #[serde(rename = "billing")]
    Billing,
    #[serde(rename = "technical-issue")]
    TechnicalIssue,
    #[serde(rename = "feature-request")]
    FeatureRequest,
    #[serde(rename = "other")]
    Other,
}
```

Generated enums implement `.as_str()` and `std::fmt::Display` to retrieve the string value:

```rust
let category = schema::triage_ticket::TicketCategory::Billing;
println!("{}", category.as_str()); // "billing"
```

### Discriminated unions

Discriminated unions generate an `enum` wrapping each variant struct:

```rust
/// A node in the rendered page tree.
#[derive(Clone, Debug, PartialEq)]
pub enum PageNode {
    KindHeading(PageNode_KindHeading),
    KindParagraph(PageNode_KindParagraph),
    KindButton(PageNode_KindButton),
    KindSection(Box<PageNode_KindSection>),
}
```

### JSON serialization & deserialization

While `prompt.render*` and `prompt.parse_response` handle JSON conversion automatically during prompt execution, all generated types implement `serde::Serialize` and `serde::Deserialize` for standalone serialization and deserialization with `serde_json`.

### Multi-namespace projects

When your project defines `<namespace>` blocks other than `Main`, templates and schemas are organized under their namespace:

```rust
use crate::gen::prompts::{schema, PROMPTS};

// Render templates from specific namespaces
let finance_prompt = PROMPTS.finance.render_summarize_transaction(
    &schema::finance::summarize_transaction::Input {
        description: "Server invoice".to_string(),
        amount: schema::finance::shared::Amount { value: 120.0, currency: "USD".to_string() },
    },
);

let legal_prompt = PROMPTS.legal.render_draft_nda(
    &schema::legal::draft_nda::Input {
        disclosing_party: "Acme Corp".to_string(),
        receiving_party: "Beta LLC".to_string(),
    },
);
```

---

## End-to-end OpenAI example

Here is a complete, production-ready example defining a generic `execute_prompt` function that integrates TypePrompt with the OpenAI HTTP API:

```rust
use reqwest::Client;
use serde_json::json;
use crate::gen::prompts::{schema, tool_executor, Prompt, ToolCall, PROMPTS};

/**
 * Generic helper to execute any TypePrompt prompt with OpenAI.
 */
async fn execute_prompt<Output, ToolExecutor>(
    client: &Client,
    prompt: &Prompt<Output, ToolExecutor>,
    tool_executor: &ToolExecutor,
    api_key: &str,
) -> Result<Output, Box<dyn std::error::Error + Send + Sync>>
where
    Output: serde::de::DeserializeOwned,
{
    // 1. Prepare tools for OpenAI from prompt.tools
    let tools: Vec<serde_json::Value> = prompt
        .tools
        .values()
        .map(|t| {
            json!({
                "type": "function",
                "function": {
                    "name": t.name,
                    "description": t.description,
                    "parameters": t.input_json_schema,
                }
            })
        })
        .collect();

    // 2. Format initial messages
    let mut messages = vec![json!({
        "role": "system",
        "content": prompt.system_message
    })];

    for example in &prompt.examples {
        messages.push(json!({ "role": "user", "content": example.user_message }));
        messages.push(json!({ "role": "assistant", "content": example.response }));
    }

    messages.push(json!({ "role": "user", "content": prompt.user_message }));

    // 3. Tool execution & completion loop
    loop {
        let mut request_body = json!({
            "model": "gpt-4o",
            "messages": messages,
        });

        if !tools.is_empty() {
            request_body["tools"] = json!(tools);
        }

        if let crate::gen::prompts::OutputFormat::Json(json_fmt) = &prompt.output_format {
            request_body["response_format"] = json!({
                "type": "json_schema",
                "json_schema": {
                    "name": "output",
                    "strict": true,
                    "schema": json_fmt.json_schema,
                }
            });
        }

        let response = client
            .post("https://api.openai.com/v1/chat/completions")
            .header("Authorization", format!("Bearer {}", api_key))
            .json(&request_body)
            .send()
            .await?
            .json::<serde_json::Value>()
            .await?;

        let choice = &response["choices"][0];
        let message = &choice["message"];
        messages.push(message.clone());

        // If the model requested tool calls, execute them with prompt.execute_tools()
        if let Some(raw_tool_calls) = message["tool_calls"].as_array() {
            if !raw_tool_calls.is_empty() {
                let tool_calls_to_execute: Vec<ToolCall> = raw_tool_calls
                    .iter()
                    .map(|tc| ToolCall {
                        call_id: tc["id"].as_str().unwrap_or_default().to_string(),
                        tool_name: tc["function"]["name"].as_str().unwrap_or_default().to_string(),
                        stringified_input: tc["function"]["arguments"].as_str().unwrap_or_default().to_string(),
                    })
                    .collect();

                let tool_results = prompt.execute_tools(&tool_calls_to_execute, tool_executor).await?;

                for result in tool_results {
                    messages.push(json!({
                        "role": "tool",
                        "tool_call_id": result.call_id,
                        "content": result.stringified_output,
                    }));
                }
                continue;
            }
        }

        // Final response: parse and validate into typed Output
        let content = message["content"].as_str().unwrap_or("");
        return prompt.parse_response(content).map_err(Into::into);
    }
}

// --- Usage ---

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let client = Client::new();
    let api_key = std::env::var("OPENAI_API_KEY").unwrap_or_default();

    // 1. Render the prompt
    let prompt = PROMPTS.render_research_question(&schema::research_question::Input {
        question: "What is TypePrompt?".to_string(),
    });

    // 2. Execute the prompt — the return value is strongly typed
    let result = execute_prompt(&client, &prompt, &ResearchExecutor, &api_key).await?;
    println!("Answer: {}", result.answer);
    println!("Sources: {:?}", result.sources);

    Ok(())
}
```
