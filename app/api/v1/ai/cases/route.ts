/**
 * GET /api/v1/ai/cases — lista os casos humanos da org (spec 15 §7, Wave 5).
 * POST — abre um caso comum por integração, com referência externa idempotente.
 * Read-only via PostgREST (`createAdminClient`) — a escrita de estado do caso
 * mora em POST /api/v1/ai/cases/[id]/reply (pg.Pool do engine, ver ADR ali).
 *
 * A consulta em si vive em `lib/escalacao/chamados.ts`: a capacidade "ver os
 * chamados em aberto" do agente lê exatamente a mesma lista, e a tela e o agente
 * discordarem sobre o que está aberto seria o pior tipo de divergência.
 *
 * O que a tela e o agente NÃO compartilham é o alcance: `conversations` tem RLS
 * por atendente, e esta lista devolve nome e telefone do contato. Por isso o
 * conjunto de conversas visíveis é resolvido ANTES, com o cliente de SESSÃO — é
 * a policy do banco que responde, não uma cópia da regra aqui —, e a divergência
 * vai declarada no argumento `visiveisPara` (o agente passa `"todas"`).
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { conversasVisiveisDosCasos, listarChamados } from "@/lib/escalacao/chamados";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { resolveAuthDual, tetoDeEscritaDoToken } from "@/lib/api/auth-dual";
import { ApiError } from "@/lib/api/types";
import { getRequestPool } from "@/lib/agent-engine/db/request-pool";
import { createReviewCase, createReviewCaseSchema } from "@/lib/ai/create-review-case";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<Response> {
  const denied = await requireSupportWrite();
  if (denied) return denied;
  const requestId = randomUUID();
  const auth = await resolveAuthDual(req, {
    requestId,
    resource: "agent_cases",
    role: "manager",
    tokenRole: "manager",
    scope: "mcp:write",
  });
  if (!auth.ok) return auth.response;
  if (auth.actor.type === "ai_agent")
    return fail("forbidden", "Use a abertura de caso do atendimento.", 403, { requestId });
  const limited = await tetoDeEscritaDoToken(auth, "review_case", requestId);
  if (limited) return limited;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail("validation_failed", "JSON inválido.", 422, { requestId });
  }
  const parsed = createReviewCaseSchema.safeParse(body);
  if (!parsed.success)
    return fail("validation_failed", "Confira os dados da revisão.", 422, { requestId });
  if (auth.via === "session") {
    const { data, error } = await auth.supabase
      .from("conversations")
      .select("id")
      .eq("organization_id", auth.organizationId)
      .eq("id", parsed.data.conversation_id)
      .maybeSingle();
    if (error || !data) return fail("not_found", "Conversa não encontrada.", 404, { requestId });
  }
  try {
    const result = await createReviewCase(
      getRequestPool(),
      auth.organizationId,
      parsed.data,
      requestId,
    );
    if (!result.reused)
      await audit({
        action: "ai.case_opened",
        organizationId: auth.organizationId,
        actorUserId: auth.actor.type === "user" ? auth.actor.id : null,
        actorApiTokenId: auth.actor.type === "api_token" ? auth.actor.id : null,
        resourceType: "agent_case",
        resourceId: result.case_id,
        requestId,
        metadata: {
          reference_id: parsed.data.reference.id,
          actor_type: auth.actor.type,
        },
      });
    return ok(result, { status: 201, requestId });
  } catch (error) {
    if (error instanceof ApiError)
      return fail(error.code, error.message, error.status, { requestId });
    logger.error("[ai/cases] falha ao abrir revisão", {
      requestId,
      organizationId: auth.organizationId,
    });
    return fail("internal_error", "Não foi possível abrir a revisão.", 500, { requestId });
  }
}

const querySchema = z.object({
  status: z.enum(["open", "resolved"]).default("open"),
});

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "agent_cases" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { org } = authz;

  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams.entries()));
  if (!parsed.success) {
    return fail("validation_failed", t("Query inválida."), 422, {
      requestId,
      details: parsed.error.flatten(),
    });
  }

  try {
    // A ordem importa: o recorte é resolvido pelo cliente de SESSÃO (RLS
    // aplicada) ANTES da leitura privilegiada. Manager e admin seguem vendo
    // tudo porque é `fn_can_view_conversation` que decide — eles são org-wide
    // por desenho, e não há regra de papel repetida aqui para desatualizar.
    const visiveisPara = await conversasVisiveisDosCasos(await createClient(), org.orgId);
    const { chamados, abertos } = await listarChamados(createAdminClient(), org.orgId, {
      estado: parsed.data.status === "open" ? "abertos" : "fechados",
      visiveisPara,
    });
    return ok({ cases: chamados, open_count: abertos }, { requestId });
  } catch (erro) {
    /**
     * O `catch` era NU, e a fila de casos ficava sem causa em lugar nenhum.
     *
     * Medido em 2026-09-18 na prova em tela: a tela mostrou "Nenhum caso
     * aberto" por 60 s seguidos enquanto o banco tinha o caso em
     * `awaiting_human` — o 500 daqui vira `data === undefined` no React Query,
     * e o componente não distingue "não há casos" de "não deu para saber".
     * Quem estava diagnosticando tinha o banco correto, a tela vazia e NADA
     * escrito entre os dois: o log do servidor não dizia uma palavra, porque
     * este `catch` descartava o erro antes de qualquer um vê-lo.
     *
     * A frase para quem lê a tela não muda (genérica de propósito: a causa é do
     * operador, não do atendente). O que muda é existir causa registrada — e é
     * a diferença entre "falhar fechado na ação, aberto na informação" e
     * simplesmente falhar.
     */
    logger.error("[ai/cases] falha ao listar os chamados", {
      requestId,
      organizationId: org.orgId,
      erro: erro instanceof Error ? erro.message : String(erro),
    });
    return fail("internal_error", t("Falha ao carregar os casos."), 500, { requestId });
  }
}
