#!/bin/bash
#
# pre_commit.sh - Run pre-commit checks, builds, linters, and tests.
#
# Usage:
#   ./pre_commit.sh                 # Full check: builds, linters, and tests in all languages
#   ./pre_commit.sh --fast          # Fast check: skips generated code tests across all languages (~30s)
#   ./pre_commit.sh --lang <name>   # Test generated code for a single language only (e.g. --lang cpp)
#
# Supported languages for --lang:
#   cpp, csharp, dart, kotlin, python, rust, swift, typescript
#
# Examples:
#   ./pre_commit.sh --lang cpp
#   ./pre_commit.sh --lang python
#   ./pre_commit.sh --fast
#

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
      echo "Unknown argument: $1" >&2
      echo "Usage: $0 [--fast] [--lang <language>]" >&2
      exit 1
      ;;
  esac
done

npm i
npm run make-static-snippets
npm run lint:fix
npm run lint
npm run format
npm run build
npm run typecheck
npm run test

ARGS=()
if [ "$FAST" = true ]; then
  ARGS+=("--fast")
fi
if [ -n "$LANG_TARGET" ]; then
  ARGS+=("--lang" "$LANG_TARGET")
fi

cd tests
./format-all.sh "${ARGS[@]}"
./test.sh "${ARGS[@]}"
cd ..
