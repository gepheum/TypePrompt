#!/bin/bash
set -e

cd ..
npm run build
cd e2e-test

# Run codegen
node ../dist/main.js gen -p projects/p1
node ../dist/main.js gen -p projects/p2
node ../dist/main.js gen -p projects/01
node ../dist/main.js gen -p projects/02
node ../dist/main.js gen -p projects/03
node ../dist/main.js gen -p projects/04
node ../dist/main.js gen -p projects/05
node ../dist/main.js gen -p projects/06
node ../dist/main.js gen -p projects/07
node ../dist/main.js gen -p projects/08

# Run Python unit tests
cd python
.venv/bin/pytest test_p1.py -v
cd ..

# Run TypeScript unit tests
cd typescript
npm i
npm run test
cd ..
