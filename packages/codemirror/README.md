# @typeprompt/codemirror

CodeMirror 6 extension for [TypePrompt](https://typeprompt.dev) templates (`.tp`).

Provides complete language support for TypePrompt templates, including syntax highlighting, live diagnostics with quick fixes, autocompletion, auto-closing tags and comments, smart indentation, and comment toggling.

---

## Installation

```bash
npm install @typeprompt/codemirror
```

---

## Quick Start

```typescript
import { EditorState } from "@codemirror/state";
import { EditorView, lineNumbers } from "@codemirror/view";
import { typeprompt, getCompilationResult } from "@typeprompt/codemirror";

const initialDoc = `<template name="Translate">
  <meta>
    model: gpt-4o
    temperature: 0.2
  </meta>

  <schema output-format="text">
    interface Input {
      text: string;
      targetLanguage: string;
    }
    type Output = string;
  </schema>

  <system>
    You are a professional translator. Translate the text into the requested language.
  </system>

  <user>
    Translate the following into <insert val="input.targetLanguage" />:
    <enclosed tag="Text"><insert val="input.text" /></enclosed>
  </user>
</template>
`;

const state = EditorState.create({
  doc: initialDoc,
  extensions: [
    lineNumbers(),
    typeprompt({
      path: "prompts/Translate.tp",
      workspaceFiles: {},
      patchBase: null,
    }),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        const compilation = getCompilationResult(update.state);
        if (compilation) {
          console.log("Is valid:", compilation.isValid);
        }
      }
    }),
  ],
});

const view = new EditorView({
  state,
  parent: document.getElementById("editor")!,
});
```

---

## Features

- **Syntax Highlighting**: Full coloring for template tags, attributes, embedded TypeScript schemas, and YAML metadata across light and dark themes.
- **Live Diagnostics**: Real-time error squiggles, warnings, and interactive quick-fix suggestions.
- **Autocompletion**: Context-aware completions for XML tags, attributes, and values.
- **Auto-Closing**: Automatically closes tags (`>`) and multiline comments (`/*`), with paired deletion on backspace.
- **Smart Indentation**: Contextual indent on `Enter` and automatic tag/bracket splitting.
- **Comment Toggling**: Position-aware comment toggling (`Mod-/`) for both XML and TypeScript blocks.
- **Fast & Incremental**: Efficient live validation as you type.

---

## Configuration

The `typeprompt` extension function accepts a `TypePromptConfig` object:

```typescript
export interface TypePromptConfig {
  /**
   * The virtual path of the file being edited.
   * e.g. "prompts/Translate.tp" or "typeprompt.yaml"
   */
  readonly path: string;

  /**
   * Additional files in the workspace (for cross-template schema resolution,
   * shared types in shared.tp, and meta.tp settings).
   * Keyed by relative file path mapping to file content.
   */
  readonly workspaceFiles: { readonly [path: string]: string };

  /**
   * Optional base compilation result for incremental patch-checking
   * and backwards-compatibility validation.
   */
  readonly patchBase: ValidCompilationResult | null;
}
```

### Multi-File / Workspace Support

To allow templates to resolve shared types (e.g. `shared.tp`) or project metadata (`meta.tp`), pass those files in `workspaceFiles`:

```typescript
typeprompt({
  path: "prompts/ShippingConfirmation.tp",
  workspaceFiles: {
    "prompts/shared.tp": `<namespace name="Main">
  type Address = {
    street: string;
    city: string;
  };
</namespace>`,
    "prompts/meta.tp": `<meta>
  interface Meta {
    model: "gpt-4o" | "gpt-4o-mini";
  }
</meta>`,
  },
  patchBase: null,
});
```

---

## Accessing State

You can inspect the latest compiler result or semantic tokens directly from the CodeMirror `EditorState`:

```typescript
import {
  getCompilationResult,
  getSemanticTokens,
} from "@typeprompt/codemirror";

// In an update listener or external event handler:
const compilation = getCompilationResult(view.state);
if (compilation) {
  const errors = compilation.finalErrors[currentPath] ?? [];
  const warnings = compilation.warnings[currentPath] ?? [];
  console.log({ errors, warnings });
}

const tokens = getSemanticTokens(view.state);
```

---

## License

MIT
