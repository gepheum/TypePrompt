#!/bin/bash
set -e

cd ..
npm run build
cd e2e-test

# Format xml files
node ../dist/main.js format -p projects/01
node ../dist/main.js format -p projects/02
node ../dist/main.js format -p projects/03
node ../dist/main.js format -p projects/04
node ../dist/main.js format -p projects/05
node ../dist/main.js format -p projects/06
node ../dist/main.js format -p projects/07
node ../dist/main.js format -p projects/08
node ../dist/main.js format -p projects/e01

node ../dist/main.js format --ci -p projects/01
node ../dist/main.js format --ci -p projects/02
node ../dist/main.js format --ci -p projects/03
node ../dist/main.js format --ci -p projects/04
node ../dist/main.js format --ci -p projects/05
node ../dist/main.js format --ci -p projects/06
node ../dist/main.js format --ci -p projects/07
node ../dist/main.js format --ci -p projects/08
node ../dist/main.js format --ci -p projects/e01

# Run codegen
node ../dist/main.js gen -p projects/01
node ../dist/main.js gen -p projects/02
node ../dist/main.js gen -p projects/03
node ../dist/main.js gen -p projects/04
node ../dist/main.js gen -p projects/05
node ../dist/main.js gen -p projects/06
node ../dist/main.js gen -p projects/07
node ../dist/main.js gen -p projects/08
node ../dist/main.js gen -p projects/e01

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

# Run C# unit tests
cd csharp
dotnet test
cd ..

