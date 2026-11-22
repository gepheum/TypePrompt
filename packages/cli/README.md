# @typeprompt/cli

CLI for [TypePrompt](https://typeprompt.dev) — a compiler for LLM prompts across TypeScript, Python, Kotlin, Rust, C++, Swift, Dart, and C#.

[Website](https://typeprompt.dev) · [Docs](https://typeprompt.dev/introduction) · [Quick Start](https://typeprompt.dev/quick-start) · [CLI Reference](https://typeprompt.dev/cli) · [VS Code Extension](https://marketplace.visualstudio.com/items?itemName=gepheum.typeprompt-vscode) · [GitHub](https://github.com/gepheum/typeprompt)

## Usage

```bash
npx @typeprompt/cli init                     # Initialize typeprompt.yaml and prompts/
npx @typeprompt/cli gen                      # Compile templates and generate native code (--watch)
npx @typeprompt/cli format                   # Format .tp files (--ci to check only)
npx @typeprompt/cli run prompts/Foo.play.tp  # Run playground inference samples
npx @typeprompt/cli patch -b <base> -o <dir> # Create a template-override patch project
```

See the [Quick start guide](https://typeprompt.dev/quick-start) and [CLI documentation](https://typeprompt.dev/cli) for details.

## License

MIT
