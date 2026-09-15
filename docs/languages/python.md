# Python Integration Guide

This guide explains how to use TypePrompt-generated Python code in your application.

---

## Installation & Setup

TypePrompt generates clean, standalone Python code that relies on three lightweight runtime dependencies:

```bash
pip install pydantic pyyaml toon-format
```

In your `typeprompt.json` configuration file, specify your Python output path:

```json
{
  "gen": {
    "python": {
      "file": "src/gen/prompts.py"
    }
  }
}
```

Generate the Python code:

```bash
npx typeprompt gen
```

---

## Quick Start

Import the `prompts` object and call `.render()` on any template with your typed input:

```python
from gen.prompts import prompts, schema

prompt = prompts.translate.render(
    schema.translate.Input(
        text="Hello world",
        target_language="French",
    )
)

print(prompt.system_message)
print(prompt.user_message)
```

---

## The `Prompt` Object

Calling `.render()` returns a `Prompt` object with everything needed to interact with an LLM:

| Property / Method | Description |
|---|---|
| `prompt.system_message` | Rendered system prompt string. |
| `prompt.user_message` | Rendered user prompt string. |
| `prompt.meta` | Typed metadata defined in the template (e.g., `model`, `temperature`). |
| `prompt.examples` | Sequence of few-shot examples (`user_message`, `response`), if defined. |
| `prompt.tools` | Dictionary of available tool definitions and their JSON schemas. |
| `prompt.output_format` | Output descriptor (`format == "json"` with `json_schema`, or `format == "text"`). |
| `prompt.parse_response(content)` | Parses and validates raw LLM response text into the typed `Output`. |
| `prompt.execute_tools(calls, executor)` | Concurrently executes tool calls using your tool executor implementation. |

---

## Parsing LLM Responses

Pass the LLM's response string to `prompt.parse_response()` to validate and parse it into your typed output:

```python
raw_model_output = response.choices[0].message.content or ""

result = prompt.parse_response(raw_model_output)
# result is fully typed according to the template's output schema
```

- **JSON Outputs**: Automatically strips markdown code fences (`` ```json ... ``` ``) and validates the JSON against the template schema with Pydantic.
- **Text Outputs**: Returns the raw text string directly as a `str`.

---

## Executing Tools

When a template defines `<tools>`, implement the tool executor and dispatch tool calls with `prompt.execute_tools()`.

### 1. Implement the Tool Executor

Define a class or object with async methods matching your tool names:

```python
from gen.prompts import schema

class ResearchExecutor:
    async def web_search(
        self, input: schema.web_search.Input
    ) -> schema.web_search.Output:
        results = await search_service(input.query)
        return schema.web_search.Output(
            results=[
                schema.web_search.Output_Results(
                    title=r.title,
                    url=r.url,
                    snippet=r.snippet,
                )
                for r in results
            ]
        )
```

### 2. Dispatch Tool Calls

Pass tool calls returned by the LLM to `prompt.execute_tools()`:

```python
import json
from gen.prompts import ToolCall

tool_calls = [
    ToolCall(
        call_id="call_123",
        tool_name="webSearch",
        stringified_input=json.dumps({"query": "TypePrompt"}),
    ),
]

responses = await prompt.execute_tools(tool_calls, ResearchExecutor())

for resp in responses:
    print(resp.call_id)             # "call_123"
    print(resp.stringified_output)  # JSON output string
```

`execute_tools` executes the matching tool functions concurrently and returns formatted responses ready to send back to the LLM.

---

## Type Definitions and `schema`

All types declared in your TypePrompt schemas are exported under the `schema` namespace:

```python
from gen.prompts import schema

# Template inputs & outputs
triage_input = schema.triage_ticket.Input
triage_output = schema.triage_ticket.Output
priority = schema.triage_ticket.Priority

# Tool inputs & outputs
search_input = schema.web_search.Input
search_output = schema.web_search.Output

# Metadata type
meta = schema.meta.Meta
```

### Multi-Namespace Projects

When your project defines `<namespace>` blocks other than `Main`, templates and schemas are organized under their namespace:

```python
from gen.prompts import prompts, schema

# Render templates from specific namespaces
finance_prompt = prompts.finance.summarize_transaction.render(
    schema.finance.summarize_transaction.Input(
        description="Server invoice",
        amount=schema.finance.shared.Amount(value=120, currency="USD"),
    )
)

legal_prompt = prompts.legal.draft_nda.render(
    schema.legal.draft_nda.Input(
        disclosing_party="Acme Corp",
        receiving_party="Beta LLC",
    )
)

# Types are nested under their namespace
FinanceInput = schema.finance.summarize_transaction.Input
LegalInput = schema.legal.draft_nda.Input
```

---

## End-to-End OpenAI Example

Here is a complete, production-ready example defining a generic `execute_prompt` function that integrates TypePrompt with the official OpenAI Python SDK:

```python
import json
from openai import AsyncOpenAI
from gen.prompts import prompts, schema, Prompt, ToolCall

client = AsyncOpenAI()

async def execute_prompt[Output, ToolExecutor](
    prompt: Prompt[Output, ToolExecutor],
    tool_executor: ToolExecutor,
) -> Output:
    """Generic helper to execute any TypePrompt prompt with OpenAI."""
    # 1. Prepare tools for OpenAI from prompt.tools
    tools = [
        {
            "type": "function",
            "function": {
                "name": t.name,
                "description": t.description,
                "parameters": t.input_json_schema,
            },
        }
        for t in prompt.tools.values()
    ]

    # 2. Format initial messages
    messages = [
        {"role": "system", "content": prompt.system_message},
        # Include few-shot examples if defined
        *(
            msg
            for ex in prompt.examples
            for msg in [
                {"role": "user", "content": ex.user_message},
                {"role": "assistant", "content": ex.response},
            ]
        ),
        {"role": "user", "content": prompt.user_message},
    ]

    # 3. Tool execution & completion loop
    while True:
        response = await client.chat.completions.create(
            model=prompt.meta.model if prompt.meta and getattr(prompt.meta, "model", None) else "gpt-4o",
            temperature=getattr(prompt.meta, "temperature", None) if prompt.meta else None,
            messages=messages,
            tools=tools or None,
            response_format=(
                {
                    "type": "json_schema",
                    "json_schema": {
                        "name": "output",
                        "strict": True,
                        "schema": prompt.output_format.json_schema,
                    },
                }
                if prompt.output_format.format == "json"
                else None
            ),
        )

        message = response.choices[0].message
        messages.append(message)

        # If the model requested tool calls, execute them with prompt.execute_tools()
        if message.tool_calls:
            tool_calls_to_execute = [
                ToolCall(
                    call_id=tc.id,
                    tool_name=tc.function.name,
                    stringified_input=tc.function.arguments,
                )
                for tc in message.tool_calls
            ]

            tool_results = await prompt.execute_tools(tool_calls_to_execute, tool_executor)

            for result in tool_results:
                messages.append({
                    "role": "tool",
                    "tool_call_id": result.call_id,
                    "content": result.stringified_output,
                })
            continue

        # Final response: parse and validate into typed Output
        return prompt.parse_response(message.content or "")


# --- Usage ---

# 1. Define tool implementations
class ResearchExecutor:
    async def web_search(
        self, input: schema.web_search.Input
    ) -> schema.web_search.Output:
        return schema.web_search.Output(
            results=[
                schema.web_search.Output_Results(
                    title="TypePrompt Overview",
                    url="https://typeprompt.dev",
                    snippet="Type-safe prompt engineering and codegen framework.",
                )
            ]
        )

# 2. Render the prompt
prompt = prompts.research_question.render(
    schema.research_question.Input(question="What is TypePrompt?")
)

# 3. Execute the prompt — the return value is strongly typed
result = await execute_prompt(prompt, ResearchExecutor())
print("Answer:", result.answer)
print("Sources:", result.sources)
```
