# Atualização do CRM e avisos operacionais da CZ Technology

O GitHub Actions `.github/workflows/sync-upstream.yml` publica uma release no fork após três releases estáveis do upstream. O n8n executa dois workflows:

- `workflows/sync-monitor.n8n.json`: consulta GitHub Actions e releases a cada 10 minutos. Avisa falhas no sync e novas versões no grupo.
- `workflows/deploy-updater.n8n.json`: consulta a release do fork e a versão da API a cada hora. Quando há versão nova, avisa início, executa `deploy-fork.sh` via SSH e avisa sucesso ou falha.

O script `deploy-fork.sh` constrói as imagens do fork antes de iniciar a atualização, invoca o kit de atualização para backup e migrações, fixa as imagens locais no `.env` da instalação e espera a saúde do site, da API e dos contêineres. A mensagem de sucesso só pode ser emitida após o marcador `deploy_result=ok`.

Na VPS, os scripts ficam em `/home/ubuntu/cizycrm-ops/`. O arquivo `alert-group.env`, com `CZ_ALERT_GROUP_ID`, deve existir nesse diretório com permissão restrita. O envio lê `WAHA_API_KEY` do `.env` da instalação. Não salve essas credenciais no repositório. O arquivo `sent-alerts.log` impede avisos repetidos da mesma execução ou release.

Para revisar uma falha de deploy, consulte `/home/ubuntu/cizycrm-ops/deploy-vX.Y.Z-<data>.log` e a execução do workflow no n8n. Para verificar a versão instalada, consulte `https://crm.cztechnology.shop/api/v1/health`.

