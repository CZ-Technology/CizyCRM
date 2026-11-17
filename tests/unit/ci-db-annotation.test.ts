import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..");
const SCRIPT = join(ROOT, "scripts/ci-db-annotation.sh");

function anotacao(log: string, code: number, sha: string, run: string) {
  const dir = mkdtempSync(join(tmpdir(), "ci-db-annotation-"));
  try {
    const path = join(dir, "gate.log");
    writeFileSync(path, log);
    return spawnSync("bash", [SCRIPT, path, String(code)], {
      cwd: ROOT,
      encoding: "utf8",
      env: { ...process.env, GITHUB_SHA: sha, GITHUB_RUN_ID: run },
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("anotação pública do gate PostgreSQL", () => {
  it("classifica release indisponível sem publicar o log e preserva o exit code", () => {
    const sha = "a".repeat(40);
    const result = anotacao(
      "==> modo INSTALL: ok\n==> modo UPDATE: ok\n==> conferência de isolamento do update.sh\n" +
        "FATAL: não consegui saber qual é a última release publicada\nPRIVATE_TOKEN=segredo-sintetico\n",
      7,
      sha,
      "44089859690",
    );
    expect(result.status).toBe(7);
    expect(result.stdout.trim()).toBe(
      `::error title=PostgreSQL gate::sha=${sha} run=44089859690 stage=release_resolution cause=stable_release_unavailable exit=7`,
    );
    expect(result.stdout + result.stderr).not.toContain("segredo-sintetico");
  });

  it("não injeta identificadores do ambiente nem texto arbitrário do log", () => {
    const result = anotacao(
      "==> invariantes: vitest\nmensagem arbitrária ::error::segredo-sintetico\n",
      3,
      "invalido%0A::warning::vazamento",
      "4%0A::warning::vazamento",
    );
    expect(result.status).toBe(3);
    expect(result.stdout.trim()).toBe(
      "::error title=PostgreSQL gate::sha=unknown run=unknown stage=invariants cause=gate_failed exit=3",
    );
    expect(result.stdout + result.stderr).not.toContain("segredo-sintetico");
  });
});
