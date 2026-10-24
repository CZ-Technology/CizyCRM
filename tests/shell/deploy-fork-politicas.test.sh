#!/usr/bin/env bash
# Exercita o wrapper com kit antigo simulado. Nenhum comando externo e real.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP_ROOT="$(cd "${TMPDIR:-/tmp}" && pwd)"
WORK="$(mktemp -d "$TMP_ROOT/cz-deploy-proof.XXXXXX")"
case "$WORK" in "$TMP_ROOT"/cz-deploy-proof.*) ;; *) exit 2 ;; esac
trap 'rm -rf -- "$WORK"' EXIT
mkdir -p "$WORK/bin" "$WORK/ops/build-src/.git" "$WORK/install/hostgator-setup-kit"
export CZ_OPS_DIR="$WORK/ops" CZ_INSTALL_DIR="$WORK/install"
# O escritor real do kit, que tambem existia na versao anterior.
sed -n '/^set_env_var() {/,/^}/p' "$ROOT/hostgator-setup-kit/_common.sh" > "$CZ_INSTALL_DIR/hostgator-setup-kit/_common.sh"
cat > "$WORK/bin/docker" <<'SH'
#!/usr/bin/env bash
if [ "$1" = build ] && [ "${FAIL_BUILD:-0}" = 1 ]; then exit 7; fi
if [ "$1" = inspect ]; then printf 'healthy\n'; fi
if [[ "$*" == *'ps -q'* ]]; then printf 'test-container\n'; fi
SH
for command in git flock; do printf '#!/usr/bin/env bash\nexit 0\n' > "$WORK/bin/$command"; done
cat > "$WORK/bin/curl" <<'SH'
#!/usr/bin/env bash
out=''
while [ "$#" -gt 0 ]; do
  if [ "$1" = -o ]; then shift; out="$1"; fi
  url="$1"; shift
done
if [[ "$url" == */api/v1/health ]]; then
  printf '{"data":{"version":"1.90.0","status":"healthy","checks":{"db":{"status":"ok"}}}}' > "$out"
fi
if [[ "$url" == */app ]]; then printf 307; else printf 200; fi
SH
cat > "$CZ_INSTALL_DIR/hostgator-setup-kit/update.sh" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
# O kit antigo exportava o arquivo antes da troca de pins.
set -a; source .env; set +a
for key in APP_PULL_POLICY WORKER_PULL_POLICY SCHEDULER_PULL_POLICY VOICE_AGENT_PULL_POLICY; do
  [ "${!key}" = missing ] || { echo "stale_policy:$key" >&2; exit 9; }
done
touch kit-ran
SH
chmod +x "$WORK/bin/"* "$CZ_INSTALL_DIR/hostgator-setup-kit/update.sh"
export PATH="$WORK/bin:$PATH"
cat > "$CZ_INSTALL_DIR/.env" <<'ENV'
APP_IMAGE=cizycrm-app:1.89.0-czfork
WORKER_IMAGE=cizycrm-worker:1.89.0-czfork
SCHEDULER_IMAGE=cizycrm-scheduler:1.89.0-czfork
APP_PULL_POLICY=never
WORKER_PULL_POLICY=never
SCHEDULER_PULL_POLICY=never
VOICE_AGENT_PULL_POLICY=never
ENV
cp "$CZ_INSTALL_DIR/.env" "$WORK/original.env"
if FAIL_BUILD=1 bash "$ROOT/infra/cz-technology/deploy-fork.sh" v1.90.0 > "$WORK/failure.log" 2>&1; then exit 1; fi
cmp "$WORK/original.env" "$CZ_INSTALL_DIR/.env"
[ ! -e "$CZ_INSTALL_DIR/kit-ran" ]
grep -q 'stage=build_app' "$WORK/failure.log"
printf 'PASS: failed build preserves pins and never invokes the kit\n'
bash "$ROOT/infra/cz-technology/deploy-fork.sh" v1.90.0 > "$WORK/success.log" 2>&1
[ -e "$CZ_INSTALL_DIR/kit-ran" ]
grep -q 'deploy_result=ok' "$WORK/success.log"
for service in APP WORKER SCHEDULER; do
  grep -q "^${service}_PULL_POLICY=never$" "$CZ_INSTALL_DIR/.env"
done
grep -q '^APP_IMAGE=cizycrm-app:1.90.0-czfork$' "$CZ_INSTALL_DIR/.env"
cmp "$WORK/original.env" "$CZ_INSTALL_DIR/".env.before-czfork-*
printf 'PASS: old kit receives missing; final pins restore the fork and never\n'
