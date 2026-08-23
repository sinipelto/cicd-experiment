#!/bin/bash

set -euo pipefail

find . -type f \( -iname '*.yml' -o -iname '*.yaml' -o -iname '*.sh' -o -iname '*.ipm' \) -exec dos2unix {} +

echo "All files have been converted to Unix line endings."
