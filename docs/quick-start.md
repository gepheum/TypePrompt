---
title: Quick start
description: Set up TypePrompt in your project and generate your first typed prompt.
---

# Quick start

## 1. Initialize your project

Run the init command in your project root:

```bash
npx typeprompt init
```

This scaffolds a `typeprompt.yaml` configuration file and a `prompts/` directory containing a starter template. See [project structure](/project-structure) for how files are organized.

## 2. Configure target languages

Edit `typeprompt.yaml` to specify where generated code should be written, for each language you target. For example, to generate TypeScript and Kotlin:

```yaml
gen:
  typescript:
    file: src/gen/prompts.ts
  kotlin:
    file: src/main/kotlin/gen/Prompts.kt
    package: com.example.prompts
```

See the language guide for your target (TypeScript, Python, Kotlin, Rust, C++, Swift, Dart, or C#) in the **Languages** menu above for the exact options and runtime dependencies.

## 3. Write a template

Create a `.tp` file under `prompts/` describing your template's schema, instructions, and few-shot examples. See [template syntax](/reference) for the full XML syntax and [schema language](/schema) for the type system.

## 4. Generate code

```bash
npx typeprompt gen
```

Pass `--watch` to regenerate automatically as you edit your templates:

```bash
npx typeprompt gen --watch
```

The generated code exposes a `prompts` object with one typed `render` method per template. Render it with typed input, send the result to your LLM, then parse the response back into a typed object — see the guide for your language for the exact API.

## Next steps

- [Playground inference](/playground): try your templates against real LLMs while you write them.
- [CLI and configuration](/cli): all commands and `typeprompt.yaml` options.
