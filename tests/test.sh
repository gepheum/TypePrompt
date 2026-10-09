#!/bin/bash
set -e

cd ..
npm run build
cd tests

# Sync template files from examples
rsync -a --delete ../examples/01-basics/prompts/ projects/01/prompts/
rsync -a --delete ../examples/02-complex-schemas/prompts/ projects/02/prompts/
rsync -a --delete ../examples/03-tools/prompts/ projects/03/prompts/
rsync -a --delete ../examples/04-variants/prompts/ projects/04/prompts/
rsync -a --delete ../examples/05-conditional-logic/prompts/ projects/05/prompts/
rsync -a --delete ../examples/06-shared-types/prompts/ projects/06/prompts/
rsync -a --delete ../examples/07-namespaces/prompts/ projects/07/prompts/

# Format xml files
node ../packages/cli/dist/main.js format -p projects/01
node ../packages/cli/dist/main.js format -p projects/02
node ../packages/cli/dist/main.js format -p projects/03
node ../packages/cli/dist/main.js format -p projects/04
node ../packages/cli/dist/main.js format -p projects/05
node ../packages/cli/dist/main.js format -p projects/06
node ../packages/cli/dist/main.js format -p projects/07
node ../packages/cli/dist/main.js format -p projects/e01
node ../packages/cli/dist/main.js format -p projects/e02
node ../packages/cli/dist/main.js format -p projects/e03
node ../packages/cli/dist/main.js format -p ../examples/e2e-kotlin

node ../packages/cli/dist/main.js format --ci -p projects/01
node ../packages/cli/dist/main.js format --ci -p projects/02
node ../packages/cli/dist/main.js format --ci -p projects/03
node ../packages/cli/dist/main.js format --ci -p projects/04
node ../packages/cli/dist/main.js format --ci -p projects/05
node ../packages/cli/dist/main.js format --ci -p projects/06
node ../packages/cli/dist/main.js format --ci -p projects/07
node ../packages/cli/dist/main.js format --ci -p projects/e01
node ../packages/cli/dist/main.js format --ci -p projects/e02
node ../packages/cli/dist/main.js format --ci -p projects/e03
node ../packages/cli/dist/main.js format --ci -p ../examples/e2e-kotlin

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

# Run Python unit tests
cd python
.venv/bin/pytest tests.py -v
cd ..

# Run TypeScript unit tests
cd typescript
npm i
npm run test
cd ..

# Run Kotlin unit tests
cd kotlin
./gradlew test
cd ..

# Build Kotlin e2e example
cd ../examples/e2e-kotlin
./gradlew build
cd ../../tests

# Run C# unit tests
cd csharp
dotnet test
cd ..

# Run Rust unit tests
cd rust
cargo test
cd ..

# Run Swift unit tests
cd swift
swift test
cd ..

# Run Dart unit tests
cd dart
dart test
cd ..

# Run C++ unit tests
cd cpp
./test.sh
cd ..
