#!/usr/bin/env bash
set -euo pipefail

# Avisos operacionais do fork, independentes do app durante um deploy.
# Configuração da instalação: /home/ubuntu/cizycrm-ops/alert-group.env
OPS_DIR="${CZ_OPS_DIR:-/home/ubuntu/cizycrm-ops}"
source "$OPS_DIR/alert-group.env"
: "${CZ_ALERT_GROUP_ID:?grupo não configurado}"
[[ "$CZ_ALERT_GROUP_ID" =~ ^[0-9-]+@g\.us$ ]] || { echo 'grupo inválido' >&2; exit 2; }

kind="${1:-}"
value="${2:-}"
attempt="${3:-}"
case "$kind" in
  sync-failed)
    [[ "$value" =~ ^[0-9]+$ ]] || exit 2
    key="sync-failed:$value"
    message="*⚠️ Falha na sincronização do CRM*\nO GitHub Actions não conseguiu atualizar o fork.\nExecução: https://github.com/CZ-Technology/CizyCRM/actions/runs/$value"
    ;;
  sync-updated)
    [[ "$value" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || exit 2
    key="sync-updated:$value"
    message="*✅ Fork atualizado*\nNova versão do CRM no repositório: $value.\nA atualização da VPS será avisada separadamente."
    ;;
  deploy-start|deploy-ok|deploy-failed)
    [[ "$value" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || exit 2
    [[ "$attempt" =~ ^[0-9]+$ ]] || exit 2
    key="$kind:$value:$attempt"
    case "$kind" in
      deploy-start) message="*🔄 Atualização da VPS iniciada*\nVersão de destino: $value.\nVou avisar quando o CRM e as APIs forem verificados." ;;
      deploy-ok) message="*✅ CRM atualizado na VPS*\nVersão: $value.\nSite, API, WhatsApp e serviços estão saudáveis." ;;
      deploy-failed) message="*❌ Falha na atualização da VPS*\nVersão de destino: $value.\nConfira a execução $attempt no workflow Atualizar CRM a cada 3 releases no n8n." ;;
    esac
    ;;
  test)
    [[ "$value" =~ ^[0-9]+$ ]] || exit 2
    key="test:$value"
    message='*🧪 Teste dos avisos de atualização*\nCanal de avisos operacionais funcionando.'
    ;;
  *) echo 'tipo de aviso inválido' >&2; exit 2 ;;
esac

mkdir -p "$OPS_DIR"
ledger="$OPS_DIR/sent-alerts.log"
exec 9>>"$OPS_DIR/sent-alerts.lock"
flock -x 9
if [[ -f "$ledger" ]] && grep -Fxq "$key" "$ledger"; then
  echo "already_sent:$key"
  exit 0
fi

text_b64="$(printf '%b' "$message" | base64 -w0)"
python3 "$OPS_DIR/send-waha-alert.py" "$CZ_ALERT_GROUP_ID" "$text_b64"
printf '%s\n' "$key" >> "$ledger"
echo "recorded:$key"

