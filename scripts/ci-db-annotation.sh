#!/usr/bin/env bash
# Public diagnostics contain only fixed classifications, never raw test output.
set -euo pipefail

log="${1:?uso: $0 <log> <exit-code>}"
status="${2:?uso: $0 <log> <exit-code>}"
[[ -f "$log" && "$status" =~ ^[1-9][0-9]*$ && "$status" -le 255 ]] || exit 2

sha="${GITHUB_SHA:-unknown}"
run="${GITHUB_RUN_ID:-unknown}"
[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || sha=unknown
[[ "$run" =~ ^[0-9]+$ ]] || run=unknown

stage=bootstrap
grep -Fq '==> modo INSTALL:' "$log" && stage=install
grep -Fq '==> modo UPDATE:' "$log" && stage=update
grep -Fq '==> conferência de isolamento do update.sh' "$log" && stage=isolation
grep -Fq '==> invariantes: vitest' "$log" && stage=invariants

cause=gate_failed
if grep -Fq 'FATAL: não consegui saber qual é a última release publicada' "$log"; then
  stage=release_resolution
  cause=stable_release_unavailable
elif grep -Eq '(^|[[:space:]])ERROR:' "$log"; then
  cause=sql_error
fi

printf '::error title=PostgreSQL gate::sha=%s run=%s stage=%s cause=%s exit=%s\n' \
  "$sha" "$run" "$stage" "$cause" "$status"
exit "$status"
