#!/bin/bash
set -e
cd "$(dirname "$0")"

cmake -B build -S .
cmake --build build
./build/runtime_logic_test
