# CI deste fork

O único workflow ativo deste repositório é [sync-upstream.yml](../.github/workflows/sync-upstream.yml). Em pull requests, ele executa `verify-ops`, typecheck integral, lint e shell, unidades em oito partes e testes de banco em PostgreSQL 15 e 17. O job `sync` fica excluído de pull requests e é o único com `contents: write`. Os jobs de validação usam runners GitHub, `contents: read` e a action local [`preparar-node`](../.github/actions/preparar-node/action.yml), com teto de cinco minutos para o preparo.

Os outros nove YAML em [`tests/fixtures/upstream-workflows/v1.113.0`](../tests/fixtures/upstream-workflows/v1.113.0/README.md) são uma referência histórica do upstream, não workflows ativados no fork. Testes herdados podem verificar as regras desses arquivos sem reativá-los. Os comandos e listas de E2E nos guias do upstream descrevem essa referência; o CI atual do fork não executa Playwright, build/publicação de imagens ou release. A presença da fixture não prova que esses processos rodaram neste fork.

A aprovação de merge exige revisão própria dos resultados reais e dos gates ainda ausentes. O PR rascunho serve para medir o candidato em CI; não publica release nem aciona deploy.
