import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type * as ReviewCaseModule from "@/lib/ai/create-review-case";
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  support: vi.fn(),
  limit: vi.fn(),
  create: vi.fn(),
  audit: vi.fn(),
  pool: {},
}));
vi.mock("@/lib/api/auth-dual", () => ({
  resolveAuthDual: mocks.auth,
  tetoDeEscritaDoToken: mocks.limit,
}));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: mocks.support }));
vi.mock("@/lib/agent-engine/db/request-pool", () => ({ getRequestPool: () => mocks.pool }));
vi.mock("@/lib/ai/create-review-case", async () => {
  const actual = await vi.importActual<typeof ReviewCaseModule>("@/lib/ai/create-review-case");
  return { ...actual, createReviewCase: mocks.create };
});
vi.mock("@/lib/audit", () => ({ audit: mocks.audit }));
import { POST } from "./route";
import { isPublicPath } from "@/lib/auth/public-paths";
const org = "9ee7a76a-0b09-46a4-a8c0-b58968d8e98e",
  lead = "1b45d5bc-c0d2-4f83-9a60-85077d64f23d";
const body = {
  conversation_id: "831de5e8-3500-47b8-8022-a9ff6cccfcc0",
  lead_id: lead,
  title: "Revisão",
  summary: "Conferir dados",
  blocker: "Precisa de aprovação",
  reference: {
    kind: "diagnostico",
    id: "58be117f-87fc-4108-8050-40893bc10161",
    entity_id: lead,
    version: "v1",
  },
};
const request = (value: unknown) =>
  new NextRequest("https://crm.example/api/v1/ai/cases", {
    method: "POST",
    body: JSON.stringify(value),
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({
    ok: true,
    via: "token",
    organizationId: org,
    actor: { type: "api_token", id: "token" },
  });
  mocks.support.mockResolvedValue(null);
  mocks.limit.mockResolvedValue(null);
  mocks.create.mockResolvedValue({ case_id: lead, reused: false });
});
it("resolve organização e ator pelo autenticador e audita a criação", async () => {
  expect(isPublicPath("/api/v1/ai/cases")).toBe(true);
  expect(isPublicPath("/api/v1/ai/cases/anything")).toBe(false);
  const response = await POST(request(body));
  expect(response.status).toBe(201);
  expect(mocks.auth).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ role: "manager", tokenRole: "manager", scope: "mcp:write" }),
  );
  expect(mocks.create).toHaveBeenCalledWith(mocks.pool, org, body, expect.any(String));
  expect(mocks.audit).toHaveBeenCalledWith(
    expect.objectContaining({
      organizationId: org,
      actorApiTokenId: "token",
      action: "ai.case_opened",
    }),
  );
});
it("recusa autenticação inválida e limite de escrita antes de qualquer criação", async () => {
  mocks.auth.mockResolvedValueOnce({ ok: false, response: new Response(null, { status: 401 }) });
  expect((await POST(request(body))).status).toBe(401);
  mocks.limit.mockResolvedValueOnce(new Response(null, { status: 429 }));
  expect((await POST(request(body))).status).toBe(429);
  expect(mocks.create).not.toHaveBeenCalled();
});
it("sessão só abre caso na conversa visível pela RLS", async () => {
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
  mocks.auth.mockResolvedValue({ ok: true, via: "session", organizationId: org,
    actor: { type: "user", id: lead }, supabase: { from: vi.fn(() => query) } });
  expect((await POST(request(body))).status).toBe(404);
  expect(mocks.create).not.toHaveBeenCalled();
  expect(query.eq).toHaveBeenCalledWith("organization_id", org);
  expect(query.eq).toHaveBeenCalledWith("id", body.conversation_id);
  query.maybeSingle.mockResolvedValue({ data: { id: body.conversation_id }, error: null });
  expect((await POST(request(body))).status).toBe(201);
});
it("não aceita organização fornecida pelo cliente, formulário inválido ou escrita de agente", async () => {
  expect((await POST(request({ ...body, organization_id: org }))).status).toBe(422);
  expect(mocks.create).not.toHaveBeenCalled();
  mocks.auth.mockResolvedValue({ ok: true, actor: { type: "ai_agent" }, organizationId: org });
  expect((await POST(request(body))).status).toBe(403);
  expect(mocks.create).not.toHaveBeenCalled();
});
it("respeita suporte somente leitura e não audita uma repetição sem alteração", async () => {
  mocks.support.mockResolvedValue(new Response(null, { status: 403 }));
  expect((await POST(request(body))).status).toBe(403);
  expect(mocks.create).not.toHaveBeenCalled();
  mocks.support.mockResolvedValue(null);
  mocks.create.mockResolvedValue({ case_id: lead, reused: true });
  expect((await POST(request(body))).status).toBe(201);
  expect(mocks.audit).not.toHaveBeenCalled();
});
