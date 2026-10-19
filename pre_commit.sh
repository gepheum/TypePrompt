#!/bin/bash

set -e

FAST=false
for arg in "$@"; do
  if [ "$arg" = "--fast" ]; then
    FAST=true
  fi
done

npm i
npm run make-static-snippets
npm run lint:fix
npm run lint
npm run format
npm run build
npm run typecheck
npm run test

cd tests
./format-all.sh
if [ "$FAST" = true ]; then
  ./test.sh --fast
else
  ./test.sh
fi
cd ..

