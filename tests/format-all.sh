#!/bin/bash
set -e

validate_lang() {
  case "$1" in
    cpp|csharp|dart|kotlin|python|rust|swift|typescript) ;;
    *)
      echo "Unknown language: $1" >&2
      echo "Supported languages: cpp, csharp, dart, kotlin, python, rust, swift, typescript" >&2
      exit 1
      ;;
  esac
}

FAST=false
LANG_TARGET=""

while [ $# -gt 0 ]; do
  case "$1" in
    --fast)
      FAST=true
      shift
      ;;
    --lang)
      if [ -z "$2" ]; then
        echo "Error: --lang requires a language argument" >&2
        exit 1
      fi
      validate_lang "$2"
      LANG_TARGET="$2"
      shift 2
      ;;
    --lang=*)
      val="${1#--lang=}"
      validate_lang "$val"
      LANG_TARGET="$val"
      shift
      ;;
    *)
      shift
      ;;
  esac
done

should_run() {
  [ "$FAST" != true ] && { [ -z "$LANG_TARGET" ] || [ "$LANG_TARGET" = "$1" ]; }
}

if should_run "python"; then
  cd python
  ./format.sh
  cd ..

  cd ../examples/e2e-python
  ./format.sh
  cd ../../tests
fi

if should_run "typescript"; then
  cd typescript
  npm i
  npm run format
  cd ..
fi

if should_run "kotlin"; then
  cd kotlin
  ./format.sh
  cd ..

  cd ../examples/e2e-kotlin
  ./format.sh
  cd ../../tests
fi

if should_run "csharp"; then
  cd csharp
  ./format.sh
  cd ..
fi

if should_run "rust"; then
  cd rust
  ./format.sh
  cd ..

  cd ../examples/e2e-rust
  ./format.sh
  cd ../../tests
fi

if should_run "swift"; then
  cd swift
  ./format.sh
  cd ..
fi

if should_run "dart"; then
  cd dart
  ./format.sh
  cd ..
fi

if should_run "cpp"; then
  cd cpp
  ./format.sh
  cd ..
fi
