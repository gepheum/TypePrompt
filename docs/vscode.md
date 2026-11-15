---
title: VS Code extension
description: Authoring, testing, and debugging TypePrompt templates in Visual Studio Code.
---

# VS Code extension

The official [TypePrompt extension](https://marketplace.visualstudio.com/items?itemName=gepheum.typeprompt-vscode) provides language support, real-time validation, and an interactive prompt playground directly within Visual Studio Code.

---

## Interactive prompt playground

The extension includes a side-by-side prompt playground to test and iterate on templates with real LLM models before generating code.

<video controls autoplay loop muted playsinline style="width: 100%; border-radius: 8px; border: 1px solid var(--vp-c-divider); margin: 1.5rem 0;">
  <source src="/vscode-demo.mp4" type="video/mp4">
  <source src="/vscode-demo.mov" type="video/quicktime">
</video>

### Workflow

1. **Open a template (`.tp`)**: Open your prompt template file containing instructions and schemas.
2. **Open playground (`.play.tp`)**: Click the **Open Playground** button (`$(beaker)`) in the editor title bar. If a playground doesn't exist yet, this automatically scaffolds a `.play.tp` file with inputs matching your schema and opens it.
3. **Open Preview**: In the `.play.tp` playground file, click the **Open Preview** button (`$(play)`) in the editor title bar to open the live interactive playground side-by-side.
4. **Run Inferences**: Click **Run inference** to execute prompts across your sample inputs, inspecting latency, token counts, and structured outputs in real time.

---

## Installation

Install the extension from the Visual Studio Code Marketplace:

- Search for **TypePrompt** in the Extensions view (`Cmd+Shift+X` / `Ctrl+Shift+X`), or
- Run from the command line:

```bash
code --install-extension gepheum.typeprompt-vscode
```

---

## Features

### Language Server (LSP)

- **Real-time diagnostics**: Instant validation for XML syntax, template tags, TypeScript schemas, and configuration files (`typeprompt.yaml`).
- **Autocompletion**: Context-aware suggestions for tags, attributes, `<insert val="..." />` placeholder paths, and schema types.
- **Go to Definition (`F12` / `Cmd+Click`)**: Jump directly to interface declarations, shared types (`shared.tp`), and template symbols.
- **Find References (`Shift+F12`)**: Find all usages of types and symbols across your project.
- **Rename Symbol (`F2`)**: Project-wide renaming for types, fields, and template identifiers.
- **Document formatting**: Format template files on save or via `Format Document`.

### Playground & inference runner

- **Multi-provider execution**: Run test inferences against OpenAI, Anthropic Claude, Google Gemini, Groq, Mistral, and local Ollama models.
- **Secure local credentials**: Store API keys in `.typeprompt.secrets.yaml` in your project root. This file is automatically detected by the extension and never checked into version control.
- **Structured output views**: Switch between **YAML**, **JSON**, and plain text output views, with one-click copy to clipboard.
- **Raw inference data export**: View full raw inference payloads (including resolved request messages, metadata, and telemetry) and save them to disk as `.run.yaml` or `.run.json` for evaluations or regression testing.

### Editor productivity

- **Auto-closing tags**: Automatically closes XML tags as you type.
- **Context-aware comments (`Cmd+/` / `Ctrl+/`)**: Toggles XML comments (`<!-- ... -->`) in markup, `//` or `/* ... */` in schemas, and `#` in YAML sample blocks.
- **Smart indentation**: Automatically maintains proper indentation in YAML sample lists, block scalars, multiline comments, and XML tags on Enter.
- **File scaffolding**: Creating a new `.tp` file automatically populates the appropriate template skeleton based on naming conventions (`PascalCase.tp` for templates, `camelCase.tp` for tools, `.play.tp` for playgrounds, `shared.tp` for namespaces).

