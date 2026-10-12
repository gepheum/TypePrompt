# Iterating on prompts using template overrides

When developing AI-powered features, you frequently need to experiment with and refine prompts: tweaking system instructions, testing different few-shot examples, adjusting temperatures, or trying different formatting styles.

While TypePrompt's built-in `<variant>` feature is great for runtime A/B testing and production branching, every new variant requires updating your codebase, rebuilding your project, restarting your backend service, and wiring variant selection logic.

**Template overrides** offer a lightweight, non-invasive alternative for rapid iteration, offline evaluations, and automated prompt refinement using coding agents.

---

## Table of contents

1. [Why template overrides?](#why-template-overrides)
2. [How template overrides work](#how-template-overrides-work)
3. [Application integration](#application-integration)
4. [The CLI patch command](#the-cli-patch-command)
5. [Automating prompt refinement with coding agents](#automating-prompt-refinement-with-coding-agents)
6. [Kotlin example](#kotlin-example)
7. [Language reference](#language-reference)

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
4. **Dynamic injection**: Your application's API endpoint passes this JSON object to `TemplateOverrider.applyOverrides(...)` to obtain a scoped `Prompts` instance used solely for that request.

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

In your endpoint handler, instantiate a scoped `Prompts` object if template overrides are present:

```kotlin
val activePrompts = request.templateOverrides?.let {
    TemplateOverrider.applyOverrides(it)
} ?: prompts
```

If `templateOverrides` is null, the global default `prompts` instance is used with zero overhead.

### 2. Inject `Prompts` into your application logic

Instead of referencing the global `prompts` singleton directly inside deep service classes, pass the `Prompts` instance as a parameter or dependency:

```kotlin
// Before (tightly coupled to global default):
import com.example.prompts.prompts

class TriageService {
    suspend fun triage(ticket: Ticket): TriageResult {
        val prompt = prompts.renderTriageTicket(...)
        // ...
    }
}

// After (flexible dependency injection):
import com.example.prompts.Prompts

class TriageService {
    suspend fun triage(ticket: Ticket, prompts: Prompts): TriageResult {
        val prompt = prompts.renderTriageTicket(...)
        // ...
    }
}
```

### 3. (Optional) Expose a templates export endpoint

To let external tools or coding agents inspect your active prompts, expose a read-only endpoint returning your compiled prompt templates:

```kotlin
// GET /api/prompts/templates
get("/api/prompts/templates") {
    call.respond(TemplateOverrider.templatesData())
}
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
  - A path to a local TypePrompt project directory (containing `typeprompt.yml`).
  - A path to a templates JSON file (saved from `TemplateOverrider.templatesData()`).
  - An HTTP/HTTPS URL serving templates JSON (e.g. `http://localhost:8080/api/prompts/templates`).
- `-o, --output <dir>` *(required)*: Path to the new patch project directory (e.g. in `/tmp` or an evaluation folder).

### What the patch project contains

The generated patch directory contains:
- `typeprompt.yml`: Preconfigured with `patch.base: patch-base.json` and `patch.overrides: overrides.json`.
- `patch-base.json`: Baseline template definitions against which your changes are validated.
- Cloned `.xml` prompt files ready for editing.

### Editing restrictions

To ensure your application code never breaks at runtime, the compiler strictly enforces the following rules in a patch project:
- **No adding or deleting templates or tools**: You can only edit templates and tools that exist in the base project.
- **No schema modifications**: You cannot edit any of the schemas of your templates or tools, with the exception of JSDoc comments on top of fields or schemas, which can be added or modified (since documentation comments guide the model without altering compiled types).

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

## Kotlin example

Below is a complete example in Kotlin (using Ktor and Kotlinx Serialization) showing how to structure your API to support template overrides.

### 1. Request and response models

```kotlin
package com.example.api

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

@Serializable
data class TriageRequest(
    val ticketId: String,
    val subject: String,
    val body: String,
    /** Optional prompt template overrides JSON object. */
    val templateOverrides: JsonElement? = null,
)

@Serializable
data class TriageResponse(
    val ticketId: String,
    val category: String,
    val urgency: String,
    val suggestedReply: String?,
)
```

### 2. Application service

```kotlin
package com.example.service

import com.example.api.TriageRequest
import com.example.api.TriageResponse
import com.example.prompts.Prompts
import com.example.prompts.Schema
import com.example.prompts.NoTools
import com.openai.client.OpenAIClient

class TriageService(private val client: OpenAIClient) {
    /**
     * Triages a customer ticket.
     *
     * @param request Customer ticket data.
     * @param prompts The Prompts instance to use (default or overridden).
     */
    suspend fun triageTicket(request: TriageRequest, prompts: Prompts): TriageResponse {
        // 1. Render the prompt using the injected Prompts instance
        val prompt = prompts.renderTriageTicket(
            Schema.TriageTicket.Input(
                subject = request.subject,
                body = request.body,
            )
        )

        // 2. Execute with OpenAI (or any LLM SDK)
        val rawLlmOutput = callOpenAi(client, prompt)

        // 3. Parse strongly-typed response
        val parsed = prompt.parseResponse(rawLlmOutput)

        return TriageResponse(
            ticketId = request.ticketId,
            category = parsed.category.name.lowercase(),
            urgency = parsed.urgency.name.lowercase(),
            suggestedReply = parsed.suggestedReply,
        )
    }

    private suspend fun callOpenAi(client: OpenAIClient, prompt: Any): String {
        // Helper to invoke OpenAI API with prompt.systemMessage, prompt.userMessage, etc.
        return "{ \"category\": \"billing\", \"urgency\": \"high\" }"
    }
}
```

### 3. Ktor routing

```kotlin
package com.example.api

import com.example.prompts.TemplateOverrider
import com.example.prompts.prompts
import com.example.service.TriageService
import io.ktor.server.application.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*

fun Route.configureRoutes(triageService: TriageService) {
    route("/api") {
        // 1. Export active prompt templates
        get("/prompts/templates") {
            call.respond(TemplateOverrider.templatesData())
        }

        // 2. Ticket triage endpoint supporting overrides
        post("/triage") {
            val request = call.receive<TriageRequest>()

            // Apply overrides if provided, or fall back to default prompts
            val activePrompts = request.templateOverrides?.let {
                try {
                    TemplateOverrider.applyOverrides(it)
                } catch (e: IllegalArgumentException) {
                    call.respond(io.ktor.http.HttpStatusCode.BadRequest, "Invalid template overrides: ${e.message}")
                    return@post
                }
            } ?: prompts

            val response = triageService.triageTicket(request, activePrompts)
            call.respond(response)
        }
    }
}
```

### 4. Running evaluations with cURL

Once your service is running:

```bash
# 1. Fetch current templates and create a patch project
npx typeprompt patch -b http://localhost:8080/api/prompts/templates -o /tmp/triage-patch

# 2. Modify prompt instructions or examples in /tmp/triage-patch/prompts/TriageTicket.xml
# ... make edits ...

# 3. Compile the patch to produce overrides.json
npx typeprompt gen -p /tmp/triage-patch

# 4. Invoke the API, embedding overrides.json as the templateOverrides JSON object:
jq -n \
  --slurpfile overrides /tmp/triage-patch/overrides.json \
  '{
    ticketId: "TCK-104",
    subject: "Payment failed",
    body: "My card was charged twice but subscription is inactive.",
    templateOverrides: $overrides[0]
  }' | curl -X POST http://localhost:8080/api/triage \
    -H "Content-Type: application/json" \
    -d @-
```

---

## Language reference

`TemplateOverrider` is available across all supported target languages:

| Language | Export default templates | Apply overrides |
|---|---|---|
| **Kotlin** | `TemplateOverrider.templatesData(): JsonElement` | `TemplateOverrider.applyOverrides(overrides: JsonElement): Prompts` |
| **TypeScript** | `templateOverrider.templatesData` | `templateOverrider.applyOverrides(overrides: unknown): Prompts` |
| **Python** | `template_overrider.templates_data` | `template_overrider.apply_overrides(overrides: Any) -> Prompts` |
| **C#** | `TemplateOverrider.TemplatesData` | `TemplateOverrider.ApplyOverrides(JsonElement overrides)` |
| **Rust** | `TemplateOverrider::templates_data()` | `TemplateOverrider::apply_overrides(&overrides)?` |
| **C++** | `TemplateOverrider::templatesData()` | `TemplateOverrider::applyOverrides(overrides)` |
| **Swift** | `TemplateOverrider.templatesData` | `try TemplateOverrider.applyOverrides(overrides)` |
| **Dart** | `TemplateOverrider.templatesData` | `TemplateOverrider.applyOverrides(overrides)` |
