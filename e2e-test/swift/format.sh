#!/bin/bash
set -e
cd "$(dirname "$0")"
swift format format -i -r Sources Tests
