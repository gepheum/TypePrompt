#!/bin/bash
set -e

cd python
./format.sh
cd ..

cd typescript
npm i
npm run format
cd ..

cd kotlin
./gradlew ktlintFormat
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
