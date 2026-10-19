#!/bin/bash
set -e

FAST=false
for arg in "$@"; do
  if [ "$arg" = "--fast" ]; then
    FAST=true
  fi
done

if [ "$FAST" != true ]; then
  cd python
  ./format.sh
  cd ..

  cd typescript
  npm i
  npm run format
  cd ..

  cd kotlin
  ./format.sh
  cd ..

  cd csharp
  ./format.sh
  cd ..

  cd rust
  ./format.sh
  cd ..

  cd swift
  ./format.sh
  cd ..

  cd dart
  ./format.sh
  cd ..

  cd cpp
  ./format.sh
  cd ..
fi

cd ../examples/e2e-kotlin
./format.sh
cd ../../tests

cd ../examples/e2e-python
./format.sh
cd ../../tests

cd ../examples/e2e-rust
./format.sh
cd ../../tests
