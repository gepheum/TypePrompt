---
title: Python
description: How to use TypePrompt-generated Python code in your application.
---

# Python integration guide

This guide explains how to use TypePrompt-generated Python code in your application.

---

## Installation & setup

TypePrompt generates clean, standalone Python (3.13+) code that relies on these lightweight runtime dependencies:

```bash
pip install pydantic pyyaml toon-format
```

In your `typeprompt.yaml` configuration file, specify your Python output path:

```yaml
gen:
  python:
    file: src/gen/prompts.py
```

Generate the Python code:

```bash
npx typeprompt gen
```

---

## Quick start

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

## The `Prompt` object

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

## Parsing LLM responses

Pass the LLM's response string to `prompt.parse_response()` to validate and parse it into your typed output:

```python
raw_model_output = (response.choices[0].message.content or "") if response.choices else ""

result = prompt.parse_response(raw_model_output)
# result is fully typed according to the template's output schema
```

- **JSON Outputs**: Automatically strips markdown code fences (`` ```json ... ``` ``) and validates the JSON against the template schema with Pydantic.
- **Text Outputs**: Returns the raw text string directly as a `str`.

---

## Executing tools

When a template defines `<tools>`, implement the tool executor and dispatch tool calls with `prompt.execute_tools()`.

### 1. Implement the tool executor

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

### 2. Dispatch tool calls

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

`execute_tools` executes matching tool functions concurrently without throwing unhandled exceptions. If a tool implementation raises an error, it captures the error and returns a `ToolCallResponse`:

- `resp.call_id`: The matching call ID.
- `resp.stringified_output`: Serialized JSON output on success, or `{"error": "<message>"}` on failure (ready to forward directly to OpenAI / Gemini).
- `resp.error`: Plain error message string if execution failed, or `None` on success (useful for Anthropic's `is_error` flag).

### 3. Type-safe tool names

TypePrompt generates a `tools` class containing `ToolName` string literal unions for each template, allowing static type-checkers (e.g., mypy, pyright) to verify tool names at compile time:

```python
# Static type check ensures "webSearch" is a valid tool for this template:
tool_name: tools.research_question.ToolName = "webSearch"
```

---

## Type definitions and `schema`

All types declared in your TypePrompt schemas are exported under the `schema` namespace:

```python
from gen.prompts import schema

# Template inputs & outputs
triage_input = schema.triage_ticket.Input
triage_output = schema.triage_ticket.Output
ticket_category = schema.triage_ticket.TicketCategory

# Tool inputs & outputs
search_input = schema.web_search.Input
search_output = schema.web_search.Output

# Metadata type
meta = schema.meta.Meta
```

### Generated Pydantic models

TypePrompt generates a `pydantic.BaseModel` for each interface declared in your schema:

```python
input = schema.triage_ticket.Input(
    subject="Bug report",
    body="Crashes on startup",
    customer_tier="pro",
    recent_tickets=[
        schema.triage_ticket.Input_RecentTickets(
            id="T-101",
            summary="Cannot login",
            category="billing",
        ),
    ],
)
```

#### Rules & behavior

- **Keyword arguments**: Instances are constructed using standard Python keyword arguments.
- **Field names & aliases**: Fields are generated with `snake_case` attribute names, but Pydantic aliases allow initialization with either `snake_case` or `camelCase`.
- **Required vs. optional**: Non-optional schema fields are required. Optional fields default to `None` and can be omitted.

### String unions

String unions generate `typing.Literal` type aliases rather than `Enum` classes:

```python
type TicketCategory = Literal[
    "billing",
    "technical-issue",
    "feature-request",
    "other",
]
```

Because string unions are plain string literals, raw `str` values can be passed directly with static type checking in mypy and pyright—no enum conversions are necessary.

### Discriminated unions

Discriminated unions generate an `Annotated[Union[...], pydantic.Field(discriminator=...)]` type alias wrapping individual Pydantic models for each variant:

```python
# A node in the rendered page tree.
type PageNode = Annotated[
    Union[
        PageNode_KindHeading,
        PageNode_KindParagraph,
        PageNode_KindButton,
        PageNode_KindSection,
    ],
    pydantic.Field(discriminator="kind"),
]
```

#### Inspecting variants with `if`

Type checkers automatically narrow the variant type when branching on `node.kind`:

```python
if node.kind == "heading":
    render_heading(node.level, node.text)
elif node.kind == "paragraph":
    render_paragraph(node.text)
elif node.kind == "button":
    render_button(node.label, node.url)
elif node.kind == "section":
    render_section(node.title, node.children)
```

### JSON serialization & deserialization

While `prompt.render*` and `prompt.parse_response` handle JSON conversion automatically during prompt execution, all generated models integrate with Pydantic for manual serialization and deserialization via `.model_dump_json()` and `.model_validate_json()`.

### Multi-namespace projects

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

## End-to-end OpenAI example

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

        if not response.choices:
            raise RuntimeError("No choices returned by OpenAI")

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
