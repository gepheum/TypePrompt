---
title: CLI and configuration
description: TypePrompt CLI commands and typeprompt.yaml options.
---

# CLI and configuration

## Commands

| Command | Description |
|---|---|
| [`init`](#init) | Initialize a TypePrompt project |
| [`gen`](#gen) | Generate code from template files |
| [`format`](#format) | Format template files |
| [`run`](#run) | Run playground inferences for a `.play.tp` file |
| [`patch`](#patch) | Initialize a patch project against a base project |

Commands that operate on a project use the current directory by default. Pass `-p <path>` to point to the directory containing `typeprompt.yaml` instead.

### `init`

```bash
npx typeprompt init [-p <path>]
```

Creates `typeprompt.yaml` and a `prompts/` directory with a starter template. The target directory is created if it doesn't exist. An existing `typeprompt.yaml` is left untouched.

### `gen`

```bash
npx typeprompt gen [-p <path>] [--watch]
```

Compiles the project and writes generated code for each language configured under [`gen`](#gen-1). With `--watch` (`-w`), regenerates whenever a template file changes. In a [patch project](/template-overrides), also writes `overrides.json`.

### `format`

```bash
npx typeprompt format [-p <path>] [--ci]
```

Formats all template files in place. With `--ci`, checks formatting without modifying files and fails if any file is not properly formatted.

### `run`

```bash
npx typeprompt run <file> [-o <path>]
```

Runs inference on every sample in a playground file and prints the results as JSON, or writes them to the file given by `-o`. The project is located by searching for `typeprompt.yaml` in the file's directory and its parents. See [playground inference](/playground#running-from-the-command-line).

### `patch`

```bash
npx typeprompt patch -b <base> -o <output-dir>
```

Creates a patch project for editing prompts against a base project. See [template overrides](/template-overrides#the-cli-patch-command).

---

## Configuration

`typeprompt.yaml` lives at the root of the project.

```yaml
include:
  - prompts/**/*.tp

gen:
  typescript:
    file: src/gen/prompts.ts
  kotlin:
    file: src/main/kotlin/gen/Prompts.kt
    package: com.example.prompts
```

### `include`

Required. List of glob patterns matching the project's `.tp` files.

### `gen`

One entry per target language. Each entry requires a `file` path for the generated code; some languages accept additional options:

| Key | Options | Guide |
|---|---|---|
| `typescript` | `file` (`.ts`) | [TypeScript](/languages/typescript) |
| `python` | `file` (`.py`) | [Python](/languages/python) |
| `kotlin` | `file` (`.kt`), `package` | [Kotlin](/languages/kotlin) |
| `rust` | `file` (`.rs`) | [Rust](/languages/rust) |
| `cpp` | `file` (`.h`), `rootNamespace` | [C++](/languages/cpp) |
| `swift` | `file` (`.swift`), `rootNamespace` | [Swift](/languages/swift) |
| `dart` | `file` (`.dart`) | [Dart](/languages/dart) |
| `csharp` | `file` (`.cs`), `rootNamespace` | [C#](/languages/csharp) |

### `patch`

Set by `npx typeprompt patch` in patch projects; you don't need to edit it. See [template overrides](/template-overrides#what-the-patch-project-contains).

### API keys

Provider API keys for playground inference are stored separately, in `.typeprompt.secrets.yaml`. See [API keys](/playground#api-keys).
