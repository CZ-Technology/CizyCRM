import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  orgId: "11111111-1111-4111-8111-111111111111",
  outraOrgId: "22222222-2222-4222-8222-222222222222",
  versaoLocal: false,
  filtrosDeVersao: [] as Array<[string, unknown]>,
  desconectar: vi.fn(async () => true),
}));

vi.mock("@/lib/auth/server", () => ({
  loadAuthUser: async () => ({ id: "usuario-teste", support: null }),
  resolveActiveOrg: async () => ({ orgId: h.orgId, role: "admin" }),
  mfaEmDivida: async () => false,
}));
vi.mock("@/lib/auth/pode-administrar-empresa", () => ({ podeAdministrarEmpresa: () => true }));
vi.mock("@/lib/impersonate/support", () => ({ supportWriteError: () => null }));
vi.mock("@/lib/ai/credenciais/login-codex", () => ({
  desconectarLoginCodex: h.desconectar,
  guardarLoginCodex: vi.fn(),
  lerLoginCodex: vi.fn(),
}));
vi.mock("@/lib/audit", () => ({ audit: async () => undefined }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (tabela: string) => {
      if (tabela === "ai_provider_credentials") {
        const consulta = {
          select: () => consulta,
          eq: () => consulta,
          maybeSingle: async () => ({ data: { id: "credencial-teste" } }),
        };
        return consulta;
      }
      if (tabela === "ai_agent_versions") {
        const consulta = {
          select: () => consulta,
          eq: (coluna: string, valor: unknown) => {
            h.filtrosDeVersao.push([coluna, valor]);
            return consulta;
          },
          then: (resolve: (resultado: { count: number; error: null }) => unknown) => {
            const orgFiltrada = h.filtrosDeVersao.find(([coluna]) => coluna === "organization_id")?.[1];
            const versoes = [{ organization_id: h.outraOrgId }, ...(h.versaoLocal ? [{ organization_id: h.orgId }] : [])];
            return resolve({ count: versoes.filter((versao) => versao.organization_id === orgFiltrada).length, error: null });
          },
        };
        return consulta;
      }
      throw new Error(`Tabela inesperada: ${tabela}`);
    },
  }),
}));

import { desconectarLoginCodexAgora } from "@/app/actions/settings/conectarLoginCodex";

beforeEach(() => {
  h.versaoLocal = false;
  h.filtrosDeVersao.length = 0;
  h.desconectar.mockClear();
});

describe("desconectar Login Codex respeita a organização ativa", () => {
  it("versão de outra empresa não bloqueia a desconexão da empresa ativa", async () => {
    expect(await desconectarLoginCodexAgora()).toEqual({ ok: true });
    expect(h.filtrosDeVersao).toContainEqual(["credential_id", "credencial-teste"]);
    expect(h.filtrosDeVersao).toContainEqual(["organization_id", h.orgId]);
    expect(h.desconectar).toHaveBeenCalledOnce();
  });

  it("versão da empresa ativa continua bloqueando a desconexão", async () => {
    h.versaoLocal = true;
    expect(await desconectarLoginCodexAgora()).toEqual({ ok: false, error: "credencial_em_uso" });
    expect(h.desconectar).not.toHaveBeenCalled();
  });
});
