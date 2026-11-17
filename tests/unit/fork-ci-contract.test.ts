/** O único workflow ativo do fork valida PR sem executar o sync de produção. */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..");
const DIR = join(ROOT, ".github/workflows");
const yaml = readFileSync(join(DIR, "sync-upstream.yml"), "utf8");
const action = readFileSync(join(ROOT, ".github/actions/preparar-node/action.yml"), "utf8");

function job(nome: string): string {
  const inicio = yaml.indexOf(`\n  ${nome}:\n`);
  if (inicio < 0) throw new Error(`job ativo não encontrado: ${nome}`);
  const resto = yaml.slice(inicio + 1);
  const fim = resto.slice(1).search(/\n  [a-zA-Z0-9_-]+:\n/);
  return fim < 0 ? resto : resto.slice(0, fim + 1);
}

const VALIDACAO = ["validate-types", "validate-static-and-shell", "validate-unit", "validate-postgres"];

describe("CI ativo do fork", () => {
  it("mantém exatamente um workflow e dispara validação em todo PR", () => {
    expect(readdirSync(DIR).filter((arquivo) => /\.ya?ml$/.test(arquivo))).toEqual(["sync-upstream.yml"]);
    expect(yaml).toMatch(/^  pull_request: \{\}$/m);
    expect(yaml).toMatch(/^permissions:\n  contents: read$/m);
  });

  it("o sync antigo não roda em PR e é o único job com escrita", () => {
    expect(job("sync")).toContain("if: github.event_name != 'pull_request'");
    expect(job("sync")).toMatch(/permissions:\n      contents: write/);
    expect(job("verify-ops")).toContain("bash tests/shell/deploy-fork-politicas.test.sh");
    for (const nome of VALIDACAO) expect(job(nome)).not.toMatch(/contents: write|pull-requests: write/);
  });

  it("os quatro jobs de validação usam runner padrão, leitura e preparo com teto", () => {
    for (const nome of VALIDACAO) {
      const bloco = job(nome);
      expect(bloco, nome).toContain("if: github.event_name == 'pull_request'");
      expect(bloco, nome).toContain("runs-on: ubuntu-24.04");
      expect(bloco, nome).toMatch(/permissions:\n      contents: read/);
      expect(bloco, nome).toContain("persist-credentials: false");
      expect(bloco, nome).toMatch(/uses: \.\/\.github\/actions\/preparar-node\n\s+timeout-minutes: 5/);
      expect(bloco, nome).not.toMatch(/pnpm\/action-setup|actions\/setup-node|self-hosted|secrets\./);
    }
    expect(action).toContain("node-version: 22");
    expect(readFileSync(join(ROOT, ".nvmrc"), "utf8").trim()).toBe("22");
    expect(action).toContain("packageManager");
    expect(action).toContain("pnpm install --frozen-lockfile");
  });

  it("os comandos cobrem tipos, lint, shell, todos os shards e as duas majors de Postgres", () => {
    expect(job("validate-types")).toContain("run: pnpm typecheck");
    const estatico = job("validate-static-and-shell");
    for (const comando of ["pnpm lint", "pnpm lint:channels", "pnpm lint:role-rank", "pnpm test:shell"]) {
      expect(estatico).toContain(`run: ${comando}`);
    }
    expect(job("validate-unit")).toContain("shard: [1, 2, 3, 4, 5, 6, 7, 8]");
    expect(job("validate-unit")).toContain("pnpm test:unit --shard=${{ matrix.shard }}/8");
    const banco = job("validate-postgres");
    expect(banco).toContain("image: [pgvector/pgvector:pg15, pgvector/pgvector:pg17]");
    expect(banco).toContain("pnpm test:db --maxWorkers=1 --no-file-parallelism");
    expect(banco).toContain("GH_TOKEN: ${{ github.token }}");
    expect(banco).toContain('codes=("${PIPESTATUS[@]}")');
    expect(banco).toContain('bash scripts/ci-db-annotation.sh "$log" "$status"');
    expect(banco).toContain('exit "$status"');
  });
});
