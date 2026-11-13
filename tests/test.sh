#!/bin/bash
set -e

FAST=false
for arg in "$@"; do
  if [ "$arg" = "--fast" ]; then
    FAST=true
  fi
done

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

if [ "$FAST" != true ]; then
  # Run Python unit tests and type checking
  cd python
  .venv/bin/pytest tests.py -v
  npx pyright
  cd ..

  # Run TypeScript unit tests and linting
  cd typescript
  npm i
  npm run typecheck
  npm run lint
  npm run test
  cd ..

  # Run Kotlin unit tests and linting
  cd kotlin
  ./gradlew test ktlintCheck
  cd ..

  # Build and lint Kotlin e2e example
  cd ../examples/e2e-kotlin
  ./gradlew build ktlintCheck
  cd ../../tests

  # Build and typecheck Python e2e example
  cd ../examples/e2e-python
  PY_BIN="../../tests/python/.venv/bin/python"
  if [ -f ".venv/bin/python" ]; then
    PY_BIN=".venv/bin/python"
  fi
  "$PY_BIN" -m py_compile src/main.py src/gen/prompts.py
  npx pyright --pythonpath "$PY_BIN" src/
  cd ../../tests

  # Build and lint Rust e2e example
  cd ../examples/e2e-rust
  cargo clippy --all-targets -- -D warnings
  cd ../../tests

  # Run C# unit tests and analysis
  cd csharp
  dotnet format --verify-no-changes
  dotnet test /warnaserror
  cd ..

  # Run Rust unit tests and static analysis
  cd rust
  cargo clippy --all-targets -- -D warnings
  cargo test
  cd ..

  # Run Swift unit tests and static analysis
  cd swift
  swift test -Xswiftc -warnings-as-errors
  cd ..

  # Run Dart unit tests and static analysis
  cd dart
  dart analyze --fatal-infos
  dart test
  cd ..

  # Run C++ unit tests
  cd cpp
  ./test.sh
  cd ..
fi
