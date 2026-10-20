#!/usr/bin/env bash
set -euo pipefail

# Deploy do fork CZ Technology. O kit oficial atualiza o banco e a instalação;
# as imagens locais abaixo garantem que o app e os workers rodem o código do fork.
OPS_DIR="${CZ_OPS_DIR:-/home/ubuntu/cizycrm-ops}"
INSTALL_DIR="${CZ_INSTALL_DIR:-/home/ubuntu/cizycrm}"
SOURCE_DIR="$OPS_DIR/build-src"
REPO_URL='https://github.com/CZ-Technology/CizyCRM.git'
target="${1:-}"
if [[ "${2:-}" == '--preflight' ]]; then
  [[ "$target" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || exit 2
  command -v docker >/dev/null
  command -v git >/dev/null
  command -v python3 >/dev/null
  test -f "$INSTALL_DIR/.env"
  test -x "$OPS_DIR/send-group-alert.sh"
  echo "preflight_ok:$target"
  exit 0
fi
[[ "$target" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo 'versão inválida' >&2; exit 2; }
version="${target#v}"
mkdir -p "$OPS_DIR"
exec 9>>"$OPS_DIR/deploy.lock"
flock -n 9 || { echo 'deploy_already_running' >&2; exit 1; }
log="$OPS_DIR/deploy-${target}-$(date -u +%Y%m%dT%H%M%SZ).log"
stage=preflight
done_ok=false
finish() {
  result=$?
  if [[ "$done_ok" == true ]]; then
    echo "deploy_result=ok version=$target"
  else
    echo "deploy_result=error version=$target stage=$stage log=$log" >&2
  fi
  exit "$result"
}
trap finish EXIT

stage=fetch
if [[ ! -d "$SOURCE_DIR/.git" ]]; then
  git clone --filter=blob:none "$REPO_URL" "$SOURCE_DIR" >>"$log" 2>&1
fi
git -C "$SOURCE_DIR" fetch origin "refs/tags/$target:refs/tags/$target" >>"$log" 2>&1
git -C "$SOURCE_DIR" checkout --detach "$target" >>"$log" 2>&1

# Construir antes de tocar no CRM em produção. Se faltar dependência ou se o
# build quebrar, nenhuma migração, imagem ou contêiner vivo é alterado.
stage=build_app
docker build --progress=quiet --build-arg "APP_VERSION=$version" \
  -t "cizycrm-app:$version-czfork" "$SOURCE_DIR" >>"$log" 2>&1
stage=build_worker
docker build --progress=quiet -f "$SOURCE_DIR/Dockerfile.worker" \
  --build-arg "APP_VERSION=$version" -t "cizycrm-worker:$version-czfork" \
  "$SOURCE_DIR" >>"$log" 2>&1
stage=build_scheduler
docker build --progress=quiet -f "$SOURCE_DIR/Dockerfile.scheduler" \
  --build-arg "APP_VERSION=$version" -t "cizycrm-scheduler:$version-czfork" \
  "$SOURCE_DIR" >>"$log" 2>&1

stage=update_kit
(cd "$INSTALL_DIR" && bash hostgator-setup-kit/update.sh --to "$target") >>"$log" 2>&1

stage=pin_fork_images
cp -p "$INSTALL_DIR/.env" "$INSTALL_DIR/.env.before-czfork-$version-$(date -u +%Y%m%dT%H%M%SZ)"
python3 - "$INSTALL_DIR/.env" "$version" <<'PY'
import os
import re
import sys
from pathlib import Path

path = Path(sys.argv[1])
version = sys.argv[2]
values = {
    'APP_IMAGE': f'cizycrm-app:{version}-czfork',
    'WORKER_IMAGE': f'cizycrm-worker:{version}-czfork',
    'SCHEDULER_IMAGE': f'cizycrm-scheduler:{version}-czfork',
    'APP_PULL_POLICY': 'never',
    'WORKER_PULL_POLICY': 'never',
    'SCHEDULER_PULL_POLICY': 'never',
}
lines = path.read_text().splitlines()
for key, value in values.items():
    matches = [i for i, line in enumerate(lines) if re.match(rf'^{re.escape(key)}=', line)]
    if len(matches) > 1:
        raise SystemExit(f'duplicate_setting:{key}')
    if matches:
        lines[matches[0]] = f'{key}={value}'
    else:
        lines.append(f'{key}={value}')
temporary = path.with_name('.env.czfork-next')
temporary.write_text('\n'.join(lines) + '\n')
os.chmod(temporary, path.stat().st_mode)
os.replace(temporary, path)
PY

stage=restart_fork
(cd "$INSTALL_DIR" && docker compose -f docker-compose.prod.yml \
  -f docker-compose.traefik.yml --env-file .env up -d --no-deps app worker scheduler) >>"$log" 2>&1

stage=health
health_file="$OPS_DIR/health-$version.json"
healthy=false
for _ in $(seq 1 36); do
  root_code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 8 https://crm.cztechnology.shop/ || true)"
  app_code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 8 https://crm.cztechnology.shop/app || true)"
  health_code="$(curl -sS -o "$health_file" -w '%{http_code}' --max-time 8 https://crm.cztechnology.shop/api/v1/health || true)"
  if [[ "$root_code" == 200 && "$app_code" == 307 && "$health_code" == 200 ]] && \
     python3 - "$health_file" "$version" <<'PY'
import json
import sys
try:
    data = json.load(open(sys.argv[1]))['data']
    assert data['version'] == sys.argv[2]
    assert data['status'] == 'healthy'
    assert all(check['status'] == 'ok' for check in data['checks'].values())
except (AssertionError, KeyError, OSError, ValueError):
    sys.exit(1)
PY
  then
    healthy=true
    break
  fi
  sleep 5
done
if [[ "$healthy" != true ]]; then
  echo "health_failed root=$root_code app=$app_code api=$health_code" >>"$log"
  exit 1
fi
for service in app worker scheduler; do
  container="$(cd "$INSTALL_DIR" && docker compose -f docker-compose.prod.yml \
    -f docker-compose.traefik.yml --env-file .env ps -q "$service")"
  [[ -n "$container" ]] || exit 1
  status="$(docker inspect --format '{{.State.Health.Status}}' "$container")"
  [[ "$status" == healthy ]] || { echo "container_unhealthy:$service:$status" >>"$log"; exit 1; }
done
done_ok=true

