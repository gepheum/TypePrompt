---
title: Template overrides
description: Rapid prompt iteration and tuning using template overrides.
---

# Iterating on prompts using template overrides

When developing AI-powered features, you frequently need to experiment with and refine prompts: tweaking system instructions, testing different few-shot examples, adjusting temperatures, or trying different formatting styles.

While TypePrompt's built-in `<variant>` feature is great for runtime A/B testing and production branching, every new variant requires updating your codebase, rebuilding your project, restarting your backend service, and wiring variant selection logic.

**Template overrides** offer a lightweight, non-invasive alternative for rapid iteration, offline evaluations, and automated prompt refinement using coding agents.

---

## Why template overrides?

| Approach | Best for | Requires app restart? | Code changes required? |
|---|---|---|---|
| **`<variant>`** | Long-term A/B testing, production feature flags | Yes | Yes (variant switch in business logic) |
| **Template overrides** | Prompt iteration, evaluations, automated prompt tuning with coding agents | No | No (overrides injected dynamically per request) |

With template overrides:
- Your application accepts an optional template overrides payload on internal API endpoints.
- You can test new prompt iterations against your live server with real dependencies and tool integrations without restarting or modifying code.
- Coding agents can autonomously refine prompts, run test suites, and produce benchmark reports without risking breaking your application or modifying your git working tree.

---

## How template overrides work

1. **Base templates**: Your compiled application packages a snapshot of its prompt templates and tools.
2. **Safe patching**: A *patch project* is initialized using `npx typeprompt patch`. The compiler enforces that template names, namespaces, and schemas remain strictly identical to the base project, ensuring runtime type safety and contract compatibility.
3. **Sparse delta**: Running `npx typeprompt gen` in the patch project generates `overrides.json`, a minimal JSON payload containing only the templates and tools that were modified.
4. **Dynamic injection**: Your application's API endpoint passes this JSON object to `template_overrider.apply_overrides(...)` to obtain a scoped `Prompts` instance used solely for that request.

---

## Application integration

Integrating template overrides into your service requires two small patterns:

### 1. Accept overrides in your API requests

Add an optional JSON field (`templateOverrides` or `promptOverrides`) to endpoints that execute prompts:

```json
{
  "ticketId": "TCK-104",
  "subject": "App crash on login",
  "body": "The app terminates immediately after entering credentials.",
  "templateOverrides": { ... }
}
```

In your endpoint handler, apply template overrides if present:

```python
active_prompts = template_overrider.apply_overrides(request.template_overrides)
```

If `template_overrides` is `None` (or omitted), `apply_overrides` returns the global default `prompts` instance.

### 2. Inject `Prompts` into your application logic

Instead of referencing the global `prompts` singleton directly inside deep service classes, pass the `Prompts` instance as a parameter or dependency:

```python
# Before (tightly coupled to global default):
from myapp.gen.prompts import prompts

class TriageService:
    async def triage(self, ticket: Ticket) -> TriageResult:
        prompt = prompts.triage_ticket.render(...)
        # ...

# After (flexible dependency injection):
from myapp.gen.prompts import Prompts

class TriageService:
    async def triage(self, ticket: Ticket, prompts: Prompts) -> TriageResult:
        prompt = prompts.triage_ticket.render(...)
        # ...
```

### 3. (Optional) Expose a templates export endpoint

To let external tools or coding agents inspect your active prompts, expose a read-only endpoint returning your compiled prompt templates:

```python
# GET /api/prompts/templates
@app.get("/api/prompts/templates")
async def get_prompt_templates() -> dict[str, Any]:
    return template_overrider.templates_data
```

---

## The CLI patch command

TypePrompt CLI provides the `patch` command to initialize an isolated workspace for prompt experimentation.

### Creating a patch project

```bash
npx typeprompt patch -b <base> -o <output-dir>
```

#### Options

- `-b, --base <path | url>` *(required)*: Specifies the base project. Can be:
  - A path to a local TypePrompt project directory (containing `typeprompt.yaml`).
  - A path to a templates JSON file (saved from `template_overrider.templates_data`).
  - An HTTP/HTTPS URL serving templates JSON (e.g. `http://localhost:8000/api/prompts/templates`).
- `-o, --output <dir>` *(required)*: Path to the new patch project directory (e.g. in `/tmp` or an evaluation folder).

### What the patch project contains

The generated patch directory contains:
- `typeprompt.yaml`: Preconfigured with `patch.base: patch-base.json` and `patch.overrides: overrides.json`.
- `patch-base.json`: Baseline template definitions against which your changes are validated.
- Cloned `.tp` prompt files ready for editing.

### Editing restrictions

To ensure your application code never breaks at runtime, the compiler strictly enforces the following rules in a patch project:
- **No adding or deleting templates or tools**: You can only edit templates and tools that exist in the base project.
- **No schema modifications**: You cannot edit any of the schemas of your templates or tools, with the exception of JSDoc comments on top of fields or types.

### Generating overrides

After modifying prompt files in the patch project, generate the override payload:

```bash
npx typeprompt gen
```

Or from outside the directory:

```bash
npx typeprompt gen -p /path/to/patch-dir
```

This compiles your changes against `patch-base.json` and writes `overrides.json`. The resulting file contains only the templates and tools that were modified.

---

## Automating prompt refinement with coding agents

Template overrides enable an autonomous feedback loop where an AI coding agent refines your prompts against real application behavior:

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. GET /api/prompts/templates                                   │
│    Fetch active prompt templates from running service           │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. npx typeprompt patch -b <url> -o /tmp/patch                  │
│    Clone templates into an isolated scratch workspace           │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. Edit prompt instructions, examples, or temperature           │
│    Agent adjusts prompts according to refinement goals          │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. npx typeprompt gen -p /tmp/patch                             │
│    Validate edits and compile overrides.json                    │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. POST /api/endpoint { ..., "templateOverrides": { ... } }     │
│    Execute real queries against live service & tools            │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│ 6. Compare & evaluate outputs across test cases                 │
│    Agent compiles metrics and presents recommendations          │
└─────────────────────────────────────────────────────────────────┘
```

Benefits of this workflow:
- **Zero application downtime**: No service rebuilds, container restarts, or process restarts.
- **Safe exploration**: The agent works in a temporary scratch directory. Your main git branch and application files are untouched.
- **Guaranteed contract compatibility**: Because TypePrompt verifies schema equivalence, the agent cannot break downstream JSON parsing or type deserialization.

---

## Python example

Below is a complete example in Python 3 (using FastAPI and Pydantic) showing how to structure your API to support template overrides.

### 1. Request and response models

```python
from typing import Any
from pydantic import BaseModel


class TriageRequest(BaseModel):
    ticket_id: str
    subject: str
    body: str
    # Optional prompt template overrides JSON object.
    template_overrides: dict[str, Any] | None = None


class TriageResponse(BaseModel):
    ticket_id: str
    category: str
    urgency: str
    suggested_reply: str | None = None
```

### 2. Application service

```python
from typing import Any
from myapp.api import TriageRequest, TriageResponse
from myapp.gen.prompts import Prompts, schema
from openai import AsyncOpenAI


class TriageService:
    def __init__(self, client: AsyncOpenAI) -> None:
        self._client = client

    async def triage_ticket(
        self, request: TriageRequest, prompts: Prompts
    ) -> TriageResponse:
        """Triages a customer ticket.

        :param request: Customer ticket data.
        :param prompts: The Prompts instance to use (default or overridden).
        """
        # 1. Render the prompt using the injected Prompts instance
        prompt = prompts.triage_ticket.render(
            schema.triage_ticket.Input(
                subject=request.subject,
                body=request.body,
            )
        )

        # 2. Execute with OpenAI (or any LLM SDK)
        raw_llm_output = await self._call_openai(prompt)

        # 3. Parse strongly-typed response
        parsed = prompt.parse_response(raw_llm_output)

        return TriageResponse(
            ticket_id=request.ticket_id,
            category=str(parsed.category),
            urgency=str(parsed.urgency),
            suggested_reply=parsed.suggested_reply,
        )

    async def _call_openai(self, prompt: Any) -> str:
        # Helper to invoke OpenAI API with prompt.system_message, prompt.user_message, etc.
        return '{"category": "billing", "urgency": "high", "suggestedReply": "We are looking into this."}'
```

### 3. FastAPI routing

```python
from typing import Any
from fastapi import FastAPI, HTTPException, status
from myapp.api import TriageRequest, TriageResponse
from myapp.gen.prompts import template_overrider
from myapp.service import TriageService
from openai import AsyncOpenAI

app = FastAPI()
triage_service = TriageService(client=AsyncOpenAI())


# 1. Export active prompt templates
@app.get("/api/prompts/templates")
async def get_prompt_templates() -> dict[str, Any]:
    return template_overrider.templates_data


# 2. Ticket triage endpoint supporting overrides
@app.post("/api/triage")
async def triage(request: TriageRequest) -> TriageResponse:
    try:
        active_prompts = template_overrider.apply_overrides(
            request.template_overrides
        )
    except (ValueError, Exception) as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid template overrides: {e}",
        )

    return await triage_service.triage_ticket(request, active_prompts)
```

### 4. Running evaluations with cURL

Once your service is running:

```bash
# 1. Fetch current templates and create a patch project
npx typeprompt patch -b http://localhost:8000/api/prompts/templates -o /tmp/triage-patch

# 2. Modify prompt instructions or examples in /tmp/triage-patch/prompts/TriageTicket.tp
# ... make edits ...

# 3. Compile the patch to produce overrides.json
npx typeprompt gen -p /tmp/triage-patch

# 4. Invoke the API, embedding overrides.json as the template_overrides JSON object:
jq -n \
  --slurpfile overrides /tmp/triage-patch/overrides.json \
  '{
    ticket_id: "TCK-104",
    subject: "Payment failed",
    body: "My card was charged twice but subscription is inactive.",
    template_overrides: $overrides[0]
  }' | curl -X POST http://localhost:8000/api/triage \
    -H "Content-Type: application/json" \
    -d @-
```

---

## Language reference

`TemplateOverrider` is available across all supported target languages:

| Language | Export default templates | Apply overrides |
|---|---|---|
| **Python** | `template_overrider.templates_data: dict[str, Any]` | `template_overrider.apply_overrides(overrides: dict[str, Any] | None): Prompts` |
| **TypeScript** | `templateOverrider.templatesData` | `templateOverrider.applyOverrides(overrides: unknown): Prompts` |
| **Kotlin** | `TemplateOverrider.templatesData: JsonElement` | `TemplateOverrider.applyOverrides(overrides: JsonElement?): Prompts` |
| **C#** | `TemplateOverrider.TemplatesData` | `TemplateOverrider.ApplyOverrides(JsonElement? overrides)` |
| **Rust** | `TemplateOverrider::templates_data(): serde_json::Value` | `TemplateOverrider::apply_overrides(overrides)?` |
| **C++** | `TemplateOverrider::templatesData(): JsonNode` | `TemplateOverrider::applyOverrides(overrides = {})` |
| **Swift** | `TemplateOverrider.templatesData: JsonElement` | `try TemplateOverrider.applyOverrides(overrides: JsonElement?)` |
| **Dart** | `TemplateOverrider.templatesData` | `TemplateOverrider.applyOverrides(overrides)` |
