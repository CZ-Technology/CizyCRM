import { beforeEach, expect, it, vi } from "vitest";
import type pg from "pg";
vi.mock("@/lib/atendimento/fronteira-server", () => ({
  guardServiceEffect: vi.fn(),
  currentExecutionBoundary: () => null,
}));
import { openCase } from "./human-cases";
const ids = {
  tenantId: "9ee7a76a-0b09-46a4-a8c0-b58968d8e98e",
  conversationId: "831de5e8-3500-47b8-8022-a9ff6cccfcc0",
  leadId: "1b45d5bc-c0d2-4f83-9a60-85077d64f23d",
};
beforeEach(() => vi.clearAllMocks());
it("espera o lock por organização/conversa antes do INSERT e confirma o evento junto do caso", async () => {
  const query = vi.fn(async (sql: string) => ({
    rows: sql.includes("with new_case") ? [{ case_id: "case" }] : [],
  }));
  const release = vi.fn(),
    connect = vi.fn(async () => ({ query, release }));
  expect(
    await openCase({ connect } as unknown as pg.Pool, ids, {
      title: "Revisão",
      summary: "Contexto",
      blocker: "Conferir",
    }),
  ).toEqual({ ok: true, caseId: "case" });
  expect(query.mock.calls.map((c) => c[0].trim().split(/\s+/).slice(0, 2).join(" "))).toEqual([
    "begin",
    "select pg_advisory_xact_lock(hashtextextended($1,",
    "with new_case",
    "commit",
  ]);
  expect(query).toHaveBeenNthCalledWith(2, expect.any(String), [
    `human-case:${ids.tenantId}:${ids.conversationId}`,
  ]);
  expect(query).toHaveBeenNthCalledWith(
    3,
    expect.stringContaining("insert into agent_case_events"),
    expect.arrayContaining([ids.tenantId, ids.conversationId, ids.leadId]),
  );
  expect(release).toHaveBeenCalled();
});
it("falha no INSERT desfaz a transação e descarta a conexão", async () => {
  const failure = new Error("falha controlada"),
    query = vi.fn(async (sql: string) => {
      if (sql.includes("with new_case")) throw failure;
      return { rows: [] };
    }),
    release = vi.fn();
  await expect(
    openCase({ connect: async () => ({ query, release }) } as unknown as pg.Pool, ids, {
      title: "Revisão",
      summary: "Contexto",
      blocker: "Conferir",
    }),
  ).rejects.toBe(failure);
  expect(query).toHaveBeenLastCalledWith("rollback");
  expect(release).toHaveBeenCalledWith(failure);
});
