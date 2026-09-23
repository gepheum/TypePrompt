#!/bin/bash
set -e
cd "$(dirname "$0")"
find . -type f \( -name "*.h" -o -name "*.cc" -o -name "*.cpp" \) -not -path "*/build/*" -exec clang-format -i {} +
