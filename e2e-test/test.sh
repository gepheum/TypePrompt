#!/bin/bash
set -e

cd ..
npm run build
cd e2e-test

# Run codegen
node ../dist/main.js gen -p projects/p1

# Run TypeScript unit tests
cd typescript
npm i
npm run test
cd ..
