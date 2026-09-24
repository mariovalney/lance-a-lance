#!/usr/bin/env bash
# Type-checks, validates the content and builds the app into dist/, which is
# what the Playwright scripts serve and drive.
set -euo pipefail
cd "$(dirname "$0")/../.."
OUT=tests/e2e/.out
mkdir -p "$OUT"
npx tsc -b
npx tsx scripts/validate-content.ts > "$OUT/validate.log" 2>&1 || { cat "$OUT/validate.log"; exit 1; }
tail -1 "$OUT/validate.log"
npm run build 2>&1 | tail -2
echo "build: dist/"
