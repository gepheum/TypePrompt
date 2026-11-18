---
title: Playground inference
description: Run prompt templates against real LLMs from VS Code or the command line.
---

# Playground inference

Playground files let you run a prompt template against a real LLM while you develop it, before writing any application code. You can run them from VS Code or from the command line.

---

## Playground files

A playground file pairs a template with a model configuration and a list of sample inputs. It lives next to the template it targets and is named after it: the playground for `prompts/Translate.tp` is `prompts/Translate.play.tp`.

```xml
<!-- Translate.play.tp -->
<playground for="Translate">
  <model>
    model: openai/gpt-4o
    temperature: 0.7
  </model>

  <samples>
  - name: "Spanish greeting"
    input:
      text: "Hello, how are you?"
      targetLanguage: "Spanish"

  - name: "French formal"
    input:
      text: "Please take a seat."
      targetLanguage: "French"
  </samples>
</playground>
```

Samples are validated against the template's `Input` schema at compile time, so they stay in sync as the template evolves. Running a playground renders the prompt for each sample, sends it to the model, and parses the response against the template's `Output` schema.

Samples can also include `history` (prior turns) and `steps` (tool calls made during the current turn) to test multi-turn conversations and tool use. Tools are never executed during inference: when the model requests a tool call, the call itself is the result. To test how the model continues, add the call and its output to the sample's `steps`.

See the [`<playground>`](/reference#the-playground-element) element reference for the full file structure.

### Why `<model>` is separate from `<meta>`

Templates often already declare a model in `<meta>`, which can make the playground's `<model>` look redundant. They serve different purposes:

- **`<meta>` is read by your application.** You define its type in `meta.tp` and your code interprets its values, so it may use internal aliases (e.g. `model: fast`) or only reference models your application is wired to call.
- **`<model>` is read by TypePrompt.** It uses a standard `provider/model` identifier and option set, so TypePrompt can call the model directly.

Keeping them separate lets you try any model on a template (a new release, a cheaper alternative, another provider) without changing the template or adding support for that model to your application first. Once you settle on a model, update `<meta>` accordingly.

---

## Running from VS Code

Running playgrounds from the editor requires the [TypePrompt extension](https://marketplace.visualstudio.com/items?itemName=gepheum.typeprompt-vscode). Search for **TypePrompt** in the Extensions view, or run:

```bash
code --install-extension gepheum.typeprompt-vscode
```

Then:

1. Open a template and click **Open Playground** (flask icon) in the editor title bar. If the template has no playground yet, one is created with a sample input matching the template's `Input` schema.
2. In the playground file, click **Open Preview** (play icon) to open the preview panel.
3. Click **Run inference** to run all samples.

<video autoplay loop muted playsinline style="width: 100%; border-radius: 8px; border: 1px solid var(--vp-c-divider); margin: 1.5rem 0;">
  <source src="/vscode-demo.webm" type="video/webm">
  <source src="/vscode-demo.mp4" type="video/mp4">
</video>

For each sample, the preview shows the parsed output or error, any tool calls requested by the model, latency, and token usage. Runs use the current contents of your editors, including unsaved changes.

Click **Save to disk** to export the full run (rendered requests, model responses, and a snapshot of the source files) as `.run.yaml` or `.run.json`.

---

## Running from the command line

```bash
npx typeprompt run prompts/Translate.play.tp
```

The command locates the project by searching for `typeprompt.yaml` in the file's directory and its parents, runs every sample, and prints the inference run as JSON. Use `-o` to write it to a file instead:

```bash
npx typeprompt run prompts/Translate.play.tp -o runs/translate.json
```

The output has the same structure as runs saved from VS Code. Each entry in `samples` contains the sample, the rendered `request` (system message, messages, tools, output schema), and a `result` whose `kind` is one of:

| `kind` | Meaning |
|---|---|
| `output` | The model replied. `output` holds the response parsed against the `Output` schema, and `rawText` the unparsed text. |
| `tool-calls` | The model requested tool calls, listed in `toolCalls`. |
| `error` | The API call failed, or the response did not match the `Output` schema. |

Results also include `telemetry` with latency and token usage whenever the model call completed.

### Use with coding agents

Because it runs without an editor and produces structured output, `typeprompt run` lets coding agents iterate on prompts on their own: edit a template, run its playground, read the results, and repeat. For example, in `AGENTS.md`:

```markdown
After changing a prompt template in `prompts/`, run its playground with
`npx typeprompt run prompts/<TemplateName>.play.tp` and check each sample's
`result`. Add samples to the playground file to cover new cases.
```

To have an agent test prompt changes against your running application, with real dependencies and tool integrations, see [automating prompt refinement with coding agents](/template-overrides#automating-prompt-refinement-with-coding-agents).

---

## API keys

VS Code and the CLI both read provider API keys from `.typeprompt.secrets.yaml` (or `.typeprompt.secrets.yml`) in the project directory, next to `typeprompt.yaml`. In VS Code, if no keys are configured, the preview offers to create the file.

```yaml
# .typeprompt.secrets.yaml
apiKeys:
  openai: sk-...
  anthropic: sk-ant-...
  # Routes requests for any model through Vercel AI Gateway
  vercelGateway: ...
```

The supported keys are `openai`, `anthropic`, `google`, `xai`, `mistral`, and `vercelGateway`. All are optional.

::: warning
This file contains secrets. Add it to your `.gitignore`.
:::

### Key resolution

For each inference, TypePrompt picks a key based on the `provider/` prefix of the model identifier:

1. If the prefix is `openai`, `anthropic`, `google`, `xai`, or `mistral` and that provider's key is set, the model is called directly through the provider's API.
2. Otherwise, if `vercelGateway` is set, the request is routed through [Vercel AI Gateway](https://vercel.com/ai-gateway) using the full model identifier.
3. Otherwise, the inference fails with an error naming the missing key.

A single `vercelGateway` key is enough to run any model the gateway supports, while provider keys take precedence for the providers they cover.
