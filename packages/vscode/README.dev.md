# TypePrompt VS Code Extension - Developer Guide

This guide covers building, running, debugging, packaging, and installing the TypePrompt VS Code extension from source.

## Building the Project

Before running or packaging the extension, build the monorepo packages (including `@typeprompt/core`, `@typeprompt/language-server`, and `typeprompt-vscode`):

```bash
# From the repository root
npm run build
```

## Running & Debugging in VS Code

1. Open the repository root in VS Code.
2. Switch to the **Run and Debug** panel (<kbd>Cmd+Shift+D</kbd> / <kbd>Ctrl+Shift+D</kbd>).
3. Select **"Launch TypePrompt VS Code Extension"** and press <kbd>F5</kbd>.
4. A new VS Code window (**Extension Development Host**) will open with the extension active.
5. In this window, open any project containing TypePrompt templates (`.tp`) or a `typeprompt.yaml` file to test features.

## Packaging the Extension

The extension is packaged into a `.vsix` file using the official Visual Studio Code Extension Manager tool ([`@vscode/vsce`](https://github.com/microsoft/vscode-vsce)).

1. Ensure the project is built:
   ```bash
   npm run build
   ```

2. Package the extension:
   ```bash
   cd packages/vscode
   npm run package
   # or: npx @vscode/vsce package --no-dependencies
   ```

This bundles the extension and language server with `esbuild` and produces `typeprompt-vscode-<version>.vsix` in `packages/vscode/`.

## Installing the Extension

Once packaged, you can install the `.vsix` file in VS Code in either of two ways:

### Option 1: Via the Command Line

```bash
code --install-extension packages/vscode/typeprompt-vscode-*.vsix
```

*(If you are already in the `packages/vscode` directory, run `code --install-extension typeprompt-vscode-*.vsix`)*

### Option 2: Via the VS Code UI

1. Open VS Code.
2. Go to the **Extensions** view (<kbd>Cmd+Shift+X</kbd> on macOS / <kbd>Ctrl+Shift+X</kbd> on Windows & Linux).
3. Click the **`...`** (More Actions / Views and More Actions) menu in the top-right corner of the Extensions panel.
4. Select **Install from VSIX...**.
5. Locate and select the generated `.vsix` file.
