import { beforeEach, expect, it, vi } from "vitest";
import type pg from "pg";
const open = vi.hoisted(() => vi.fn());
vi.mock("@/lib/agent-engine/agent/human-cases", () => ({ openCase: open }));
import { createReviewCase, createReviewCaseSchema } from "./create-review-case";
const org = "9ee7a76a-0b09-46a4-a8c0-b58968d8e98e",
  lead = "1b45d5bc-c0d2-4f83-9a60-85077d64f23d",
  conv = "831de5e8-3500-47b8-8022-a9ff6cccfcc0",
  caseId = "46308981-633e-4368-b372-93ddfa60280c";
const input = createReviewCaseSchema.parse({
  lead_id: lead,
  conversation_id: conv,
  title: "Revisão",
  summary: "Conferir informações",
  blocker: "Precisa de aprovação",
  reference: {
    kind: "diagnostico",
    id: "58be117f-87fc-4108-8050-40893bc10161",
    entity_id: lead,
    version: "v1",
  },
});
function pool(link = true, existing: unknown[] = []) {
  const query = vi.fn(async (sql: string, values: unknown[]) => {
    expect(values[0]).toBe(org);
    if (sql.includes("from crm_leads")) return { rows: link ? [{ contact_id: "contato" }] : [] };
    return { rows: existing };
  });
  return { query, db: { query } as unknown as pg.Pool };
}
beforeEach(() => {
  vi.clearAllMocks();
  open.mockResolvedValue({ ok: true, caseId });
});
it("vincula o caso à conversa e ao lead da organização sem fazer handoff", async () => {
  const p = pool();
  expect(await createReviewCase(p.db, org, input, "test-request")).toEqual({
    case_id: caseId,
    reused: false,
  });
  expect(open).toHaveBeenCalledWith(
    p.db,
    { tenantId: org, conversationId: conv, leadId: lead, agentId: undefined },
    expect.objectContaining({
      actorKind: "system",
      externalReference: input.reference,
      contextSnapshot: { external_reference: input.reference },
    }),
  );
  expect(p.query.mock.calls[0]![0]).toContain("c.organization_id=l.organization_id");
});
it("outra organização ou conversa sem o contato do lead não cria caso", async () => {
  const p = pool(false);
  await expect(createReviewCase(p.db, org, input, "test-request")).rejects.toMatchObject({
    status: 404,
  });
  expect(open).not.toHaveBeenCalled();
});
it("reutiliza a solicitação já registrada mesmo após fechar o caso e rejeita conflito", async () => {
  const row = {
    id: caseId,
    conversation_id: conv,
    context_snapshot: { external_reference: input.reference },
  };
  const p = pool(true, [row]);
  expect(await createReviewCase(p.db, org, input, "test-request")).toEqual({
    case_id: caseId,
    reused: true,
  });
  expect(open).not.toHaveBeenCalled();
  await expect(
    createReviewCase(
      pool(true, [{ ...row, conversation_id: lead }]).db,
      org,
      input,
      "test-request",
    ),
  ).rejects.toMatchObject({ status: 409 });
});
