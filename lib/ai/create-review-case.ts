import type pg from "pg";
import { z } from "zod";
import { openCase } from "@/lib/agent-engine/agent/human-cases";
import { ApiError } from "@/lib/api/types";

const referenceSchema = z.strictObject({
  kind: z.string().min(1).max(40),
  id: z.string().uuid(),
  entity_id: z.string().uuid(),
  version: z.string().min(1).max(80),
});

export const createReviewCaseSchema = z
  .strictObject({
    conversation_id: z.string().uuid(),
    lead_id: z.string().uuid(),
    agent_id: z.string().uuid().optional(),
    title: z.string().min(1).max(200),
    summary: z.string().min(1).max(4000),
    blocker: z.string().min(1).max(1000),
    reference: referenceSchema,
  })
  .superRefine((body, ctx) => {
    if (body.reference.entity_id !== body.lead_id)
      ctx.addIssue({ code: "custom", message: "A revisão não pertence ao lead." });
  });

export async function createReviewCase(
  pool: pg.Pool,
  organizationId: string,
  input: z.infer<typeof createReviewCaseSchema>,
  requestId: string,
) {
  // Contato e conversa vêm do banco da organização autenticada, não do formulário.
  const { rows: links } = await pool.query<{ contact_id: string }>(
    `select l.contact_id from crm_leads l join conversations c
       on c.organization_id=l.organization_id and c.contact_id=l.contact_id
     where l.organization_id=$1 and l.id=$2 and c.id=$3`,
    [organizationId, input.lead_id, input.conversation_id],
  );
  if (!links[0]?.contact_id)
    throw new ApiError(404, "not_found", undefined, requestId, "Lead ou conversa não encontrado.");
  if (input.agent_id) {
    const { rows } = await pool.query(
      "select id from ai_agents where organization_id=$1 and id=$2",
      [organizationId, input.agent_id],
    );
    if (!rows.length)
      throw new ApiError(404, "not_found", undefined, requestId, "Agente não encontrado.");
  }
  async function existing() {
    const { rows } = await pool.query<{
      id: string;
      conversation_id: string;
      context_snapshot: { external_reference: unknown };
    }>(
      `select id,conversation_id,context_snapshot from agent_cases where organization_id=$1
        and context_snapshot->'external_reference'->>'id'=$2
        and context_snapshot->'external_reference'->>'kind'=$3 limit 2`,
      [organizationId, input.reference.id, input.reference.kind],
    );
    if (!rows.length) return null;
    const reference = referenceSchema.safeParse(rows[0]?.context_snapshot?.external_reference);
    if (
      rows.length !== 1 ||
      !reference.success ||
      rows[0]?.conversation_id !== input.conversation_id ||
      JSON.stringify(reference.data) !== JSON.stringify(input.reference)
    )
      throw new ApiError(
        409,
        "conflict",
        undefined,
        requestId,
        "A solicitação já tem outra revisão.",
      );
    return rows[0]!.id;
  }
  const found = await existing();
  if (found) return { case_id: found, reused: true };
  const result = await openCase(
    pool,
    {
      tenantId: organizationId,
      conversationId: input.conversation_id,
      agentId: input.agent_id,
      leadId: input.lead_id,
    },
    {
      title: input.title,
      summary: input.summary,
      blocker: input.blocker,
      actorKind: "system",
      externalReference: input.reference,
      contextSnapshot: { external_reference: input.reference },
    },
  );
  if (result.ok) return { case_id: result.caseId, reused: false };
  const raced = await existing();
  if (raced) return { case_id: raced, reused: true };
  throw new ApiError(
    409,
    "conflict",
    undefined,
    requestId,
    "A conversa já tem outro caso aberto. Resolva-o antes de abrir esta revisão.",
  );
}
