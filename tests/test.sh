#!/bin/bash
set -e

validate_lang() {
  case "$1" in
    cpp|csharp|dart|kotlin|python|rust|swift|typescript) ;;
    *)
      echo "Unknown language: $1" >&2
      echo "Supported languages: cpp, csharp, dart, kotlin, python, rust, swift, typescript" >&2
      exit 1
      ;;
  esac
}

FAST=false
LANG_TARGET=""

while [ $# -gt 0 ]; do
  case "$1" in
    --fast)
      FAST=true
      shift
      ;;
    --lang)
      if [ -z "$2" ]; then
        echo "Error: --lang requires a language argument" >&2
        exit 1
      fi
      validate_lang "$2"
      LANG_TARGET="$2"
      shift 2
      ;;
    --lang=*)
      val="${1#--lang=}"
      validate_lang "$val"
      LANG_TARGET="$val"
      shift
      ;;
    *)
      shift
      ;;
  esac
done

should_run() {
  [ "$FAST" != true ] && { [ -z "$LANG_TARGET" ] || [ "$LANG_TARGET" = "$1" ]; }
}

cd ..
npm run build
cd tests

# Format template files
node ../packages/cli/dist/main.js format -p ../examples/01-basics
node ../packages/cli/dist/main.js format -p ../examples/02-complex-schemas
node ../packages/cli/dist/main.js format -p ../examples/03-tools
node ../packages/cli/dist/main.js format -p ../examples/04-variants
node ../packages/cli/dist/main.js format -p ../examples/05-conditional-logic
node ../packages/cli/dist/main.js format -p ../examples/06-shared-types
node ../packages/cli/dist/main.js format -p ../examples/07-namespaces

# Sync template files from examples
rsync -a --delete ../examples/01-basics/prompts/ projects/01/prompts/
rsync -a --delete ../examples/02-complex-schemas/prompts/ projects/02/prompts/
rsync -a --delete ../examples/03-tools/prompts/ projects/03/prompts/
rsync -a --delete ../examples/04-variants/prompts/ projects/04/prompts/
rsync -a --delete ../examples/05-conditional-logic/prompts/ projects/05/prompts/
rsync -a --delete ../examples/06-shared-types/prompts/ projects/06/prompts/
rsync -a --delete ../examples/07-namespaces/prompts/ projects/07/prompts/

node ../packages/cli/dist/main.js format -p projects/e01
node ../packages/cli/dist/main.js format -p projects/e02
node ../packages/cli/dist/main.js format -p projects/e03
node ../packages/cli/dist/main.js format -p ../examples/e2e-kotlin
node ../packages/cli/dist/main.js format -p ../examples/e2e-python
node ../packages/cli/dist/main.js format -p ../examples/e2e-rust
node ../packages/cli/dist/main.js format --ci -p projects/e01
node ../packages/cli/dist/main.js format --ci -p projects/e02
node ../packages/cli/dist/main.js format --ci -p projects/e03
node ../packages/cli/dist/main.js format --ci -p ../examples/e2e-kotlin
node ../packages/cli/dist/main.js format --ci -p ../examples/e2e-python
node ../packages/cli/dist/main.js format --ci -p ../examples/e2e-rust

# Run codegen
node ../packages/cli/dist/main.js gen -p projects/01
node ../packages/cli/dist/main.js gen -p projects/02
node ../packages/cli/dist/main.js gen -p projects/03
node ../packages/cli/dist/main.js gen -p projects/04
node ../packages/cli/dist/main.js gen -p projects/05
node ../packages/cli/dist/main.js gen -p projects/06
node ../packages/cli/dist/main.js gen -p projects/07
node ../packages/cli/dist/main.js gen -p projects/e01
node ../packages/cli/dist/main.js gen -p projects/e02
node ../packages/cli/dist/main.js gen -p projects/e03
node ../packages/cli/dist/main.js gen -p ../examples/e2e-kotlin
node ../packages/cli/dist/main.js gen -p ../examples/e2e-python
node ../packages/cli/dist/main.js gen -p ../examples/e2e-rust

# Run Python unit tests and type checking
if should_run "python"; then
  cd python
  .venv/bin/pytest tests.py -v
  npx pyright
  cd ..

  # Build and typecheck Python e2e example
  cd ../examples/e2e-python
  PY_BIN="../../tests/python/.venv/bin/python"
  if [ -f ".venv/bin/python" ]; then
    PY_BIN=".venv/bin/python"
  fi
  "$PY_BIN" -m py_compile src/main.py src/gen/prompts.py
  npx pyright --pythonpath "$PY_BIN" src/
  cd ../../tests
fi

# Run TypeScript unit tests and linting
if should_run "typescript"; then
  cd typescript
  npm i
  npm run typecheck
  npm run lint
  npm run test
  cd ..
fi

# Run Kotlin unit tests and linting
if should_run "kotlin"; then
  cd kotlin
  ./gradlew test ktlintCheck
  cd ..

  # Build and lint Kotlin e2e example
  cd ../examples/e2e-kotlin
  ./gradlew build ktlintCheck
  cd ../../tests
fi

# Run C# unit tests and analysis
if should_run "csharp"; then
  cd csharp
  dotnet format --verify-no-changes
  dotnet test /warnaserror
  cd ..
fi

# Run Rust unit tests and static analysis
if should_run "rust"; then
  cd rust
  cargo clippy --all-targets -- -D warnings
  cargo test
  cd ..

  # Build and lint Rust e2e example
  cd ../examples/e2e-rust
  cargo clippy --all-targets -- -D warnings
  cd ../../tests
fi

# Run Swift unit tests and static analysis
if should_run "swift"; then
  cd swift
  swift test -Xswiftc -warnings-as-errors
  cd ..
fi

# Run Dart unit tests and static analysis
if should_run "dart"; then
  cd dart
  dart analyze --fatal-infos
  dart test
  cd ..
fi

# Run C++ unit tests
if should_run "cpp"; then
  cd cpp
  ./test.sh
  cd ..
fi
