#!/usr/bin/env bash
# Type-checks, validates the content, builds the artifact and wraps it in a mock
# claude.ai page skeleton (tests/e2e/.out/skeleton.html) for the Playwright scripts.
set -euo pipefail
cd "$(dirname "$0")/../.."
OUT=tests/e2e/.out
mkdir -p "$OUT"
npx tsc -b
npx tsx scripts/validate-content.ts > "$OUT/validate.log" 2>&1 || { cat "$OUT/validate.log"; exit 1; }
tail -1 "$OUT/validate.log"
npm run build:artifact 2>&1 | tail -1
{ printf '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui;background:#fafafa}img{max-width:100%%}[hidden]{display:none!important}</style></head><body>'; cat artifact/lance-a-lance.html; printf '</body></html>'; } > "$OUT/skeleton.html"
echo "skeleton: $OUT/skeleton.html"
