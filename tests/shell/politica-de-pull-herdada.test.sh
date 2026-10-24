#!/usr/bin/env bash
# A politica gravada no .env deve valer tambem no ambiente que o Compose herda.
# Nao sobe servicos nem usa dados da instalacao; config apenas resolve o YAML.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP_ROOT="$(cd "${TMPDIR:-/tmp}" && pwd)"
WORK="$(mktemp -d "$TMP_ROOT/cz-policy-proof.XXXXXX")"
case "$WORK" in "$TMP_ROOT"/cz-policy-proof.*) ;; *) exit 2 ;; esac
trap 'rm -rf -- "$WORK"' EXIT
source "$ROOT/hostgator-setup-kit/_common.sh"
# Os avisos e a correcao do WAHA nao fazem parte deste teste.
completar_par_vapid() { :; }
waha_amd64_conhecido_em_arm() { return 1; }
cat > "$WORK/compose.yml" <<'YAML'
services:
  app:
    image: example/app:test
    pull_policy: ${APP_PULL_POLICY:-missing}
  worker:
    image: example/worker:test
    pull_policy: ${WORKER_PULL_POLICY:-missing}
  scheduler:
    image: example/scheduler:test
    pull_policy: ${SCHEDULER_PULL_POLICY:-missing}
  voice:
    image: example/voice:test
    pull_policy: ${VOICE_AGENT_PULL_POLICY:-missing}
YAML
check() {
  local target="$1" expected="$2" rendered count
  export APP_PULL_POLICY=never WORKER_PULL_POLICY=never
  export SCHEDULER_PULL_POLICY=never VOICE_AGENT_PULL_POLICY=never
  : > "$WORK/install.env"
  gravar_imagens "$WORK/install.env" "$target"
  rendered="$(docker compose -f "$WORK/compose.yml" --env-file "$WORK/install.env" config)"
  count="$(printf '%s\n' "$rendered" | grep -c "pull_policy: $expected" || true)"
  if [ "$count" != 4 ]; then
    printf 'FAIL: target=%s expected=%s inherited=%s/%s/%s/%s\n' \
      "$target" "$expected" "$APP_PULL_POLICY" "$WORKER_PULL_POLICY" \
      "$SCHEDULER_PULL_POLICY" "$VOICE_AGENT_PULL_POLICY" >&2
    exit 1
  fi
  printf 'PASS: %s resolves all four policies to %s\n' "$target" "$expected"
}
check 1.89.0 missing
check stable always
