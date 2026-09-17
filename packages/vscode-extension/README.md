# TypePrompt VS Code Extension

VS Code extension for editing TypePrompt templates (`.xml`, `.prompt`, `.prompt.xml`).

Powered by `@typeprompt/language-server` and `@typeprompt/core`.

## Features
- Real-time syntax and structural error diagnostics.
- Tag and attribute completions.
- Hover documentation for TypePrompt elements.

## Running & Debugging in VS Code

1. **Build the projects**:
   ```bash
   npm run build
   ```

2. **Launch Extension Development Host**:
   - Open this workspace in VS Code.
   - Switch to the **Run and Debug** panel (<kbd>Cmd+Shift+D</kbd> / <kbd>Ctrl+Shift+D</kbd>).
   - Select **"Launch TypePrompt VS Code Extension"** and press <kbd>F5</kbd>.
   - A new VS Code window (Extension Development Host) will open.

3. **Try it out**:
   - In the new VS Code window, open any TypePrompt XML/prompt file.
   - Modify tags, introduce syntax or schema errors to see live diagnostics reported in the Problems panel.
