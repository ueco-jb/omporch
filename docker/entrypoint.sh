#!/usr/bin/env bash
set -euo pipefail

BASE="${PI_CODING_AGENT_DIR:-$HOME/.omp/agent}"
DIRECTIVES="/opt/ompbox/directives"

mkdir -p "$BASE"

if [ -d "$DIRECTIVES" ]; then
  for f in RULES.md AGENTS.md; do
    if [ -f "$DIRECTIVES/$f" ]; then
      cp -f "$DIRECTIVES/$f" "$BASE/$f"
    fi
  done
fi
exec "$@"
