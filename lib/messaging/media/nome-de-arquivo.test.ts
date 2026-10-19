import { describe, expect, it } from "vitest";

import { nomeDeArquivoParaEnvio } from "./nome-de-arquivo";

describe("nomeDeArquivoParaEnvio", () => {
  it("mantém um nome comercial e remove separadores de caminho", () => {
    expect(nomeDeArquivoParaEnvio("Análise Score GMN - Maria.pdf")).toBe("Análise Score GMN - Maria.pdf");
    expect(nomeDeArquivoParaEnvio("../Maria\\exame.pdf")).toBe("..-Maria-exame.pdf");
  });

  it("ignora caracteres de controle e nomes vazios", () => {
    expect(nomeDeArquivoParaEnvio("\u202E\n ")).toBeNull();
    expect(nomeDeArquivoParaEnvio("\u202EAnálise.pdf")).toBe("Análise.pdf");
  });
});
