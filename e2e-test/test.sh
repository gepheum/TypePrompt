#!/bin/bash
set -e

cd ..
npm run build
cd e2e-test

# Run codegen
node ../dist/main.js gen -p projects/p1
node ../dist/main.js gen -p projects/p2

# Run Python unit tests
cd python
.venv/bin/pytest test_p1.py -v
cd ..

# Run TypeScript unit tests
cd typescript
npm i
npm run test
cd ..
