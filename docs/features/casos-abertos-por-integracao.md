# Abertura de casos por integração

`POST /api/v1/ai/cases` permite a uma integração abrir um caso comum na fila
existente. Aceita sessão de gerente ou token com papel mínimo de gerente e
escopo `mcp:write`. A organização vem da autenticação; sessões também passam
pelo recorte RLS da conversa. Lead e conversa devem pertencer ao mesmo contato
e organização.

O corpo contém `conversation_id`, `lead_id`, título, resumo, bloqueio e
`reference` com `kind`, UUID `id`, UUID `entity_id` do lead e `version`.
`agent_id` é opcional. A referência fica em `context_snapshot.external_reference`.
Repetir a referência reutiliza o caso, inclusive depois de fechado. Divergência
de referência ou outro caso aberto na conversa retorna conflito.

A abertura compartilha a operação nativa de casos, com lock transacional por
organização e conversa, evento `opened` de autoria `system` e auditoria `ai.case_opened`. A
referência externa também é serializada por organização, mesmo entre conversas
diferentes, e permanece reservada depois do fechamento. Não
transfere atendimento nem silencia o agente. Nenhuma migração foi adicionada.

## Revisão no n8n

Na integração Score GMN, o resumo contém links para formulários protegidos do
n8n. Correção das respostas, recálculo da nota e autenticação dos revisores
ficam nessa integração. O CRM guarda o caso, os campos já existentes do lead e
o histórico. A integração fecha o caso pela capacidade nativa
`crm_close_human_case`, como automação; o texto registra a pessoa autenticada
no formulário sem forjar um evento de sessão humana do CRM.

A tela personalizada de revisão, o contrato `review_form` e as mudanças no
componente de casos e na rota de resposta humana foram removidos. A interface
e o comportamento de resposta dos casos existentes permanecem nativos.

## Verificação

Testes da autenticação da rota, vínculo por organização, repetição e lock
concorrente. A prova de PostgreSQL 15 descartável criou um único caso em dez
tentativas simultâneas e recusou outra organização. Não substitui a suíte
completa de baseline/RLS. A atualização do aplicativo ainda não foi implantada.
