#!/bin/bash
# Rank overnight mail candidates via Grok Build CLI (stdin prompt → stdout JSON).
# Requires ~/.grok/bin/grok logged in.
set -euo pipefail
GROK="${GROK_BIN:-$HOME/.grok/bin/grok}"
if [[ ! -x "$GROK" ]]; then
  echo "grok not found at $GROK" >&2
  exit 127
fi
SCHEMA="${1:-}"
tmp="$(mktemp -t pd-grok-overnight.XXXXXX)"
trap 'rm -f "$tmp"' EXIT
cat >"$tmp"
args=(--prompt-file "$tmp" --verbatim --max-turns 1 --no-subagents --disable-web-search)
if [[ -n "$SCHEMA" ]]; then
  args+=(--json-schema "$SCHEMA")
else
  args+=(--output-format plain)
fi
exec "$GROK" "${args[@]}"
