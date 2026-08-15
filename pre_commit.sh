#!/bin/bash

set -e

npm i
npm run make-static-snippets
npm run lint:fix
npm run lint
npm run format
npm run build
npm run typecheck
npm run test

cd e2e-test
./format-all.sh
./test.sh
cd ..
