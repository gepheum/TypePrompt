#!/bin/bash
set -e
cd "$(dirname "$0")"

if [ -f ".venv/bin/ruff" ]; then
  .venv/bin/ruff format src/*.py
elif command -v ruff &> /dev/null; then
  ruff format src/*.py
elif [ -f "../../tests/python/.venv/bin/ruff" ]; then
  ../../tests/python/.venv/bin/ruff format src/*.py
fi
