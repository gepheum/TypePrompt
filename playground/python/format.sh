#!/bin/bash
set -e
cd "$(dirname "$0")"
.venv/bin/ruff format *.py
