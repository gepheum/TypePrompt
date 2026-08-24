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

