import { describe, expect, it } from "vitest";

import {
  nomeDeArquivoParaEnvio,
  nomeDoAnexoParaEnviar,
  nomeOriginalDaMensagem,
} from "./nome-de-arquivo";

const CAMINHO = "org/conv/out-3f9a2b1c-1111-4222-8333-444455556666.pdf";

describe("nomeDeArquivoParaEnvio", () => {
  it("mantém um nome legível e remove separadores de caminho", () => {
    expect(nomeDeArquivoParaEnvio("Relatório de atendimento.pdf")).toBe("Relatório de atendimento.pdf");
    expect(nomeDeArquivoParaEnvio("../pasta\\relatorio.pdf")).toBe("..-pasta-relatorio.pdf");
  });

  it("ignora caracteres de controle e nomes vazios", () => {
    expect(nomeDeArquivoParaEnvio("\u202E\n ")).toBeNull();
    expect(nomeDeArquivoParaEnvio("\u202ERelatório.pdf")).toBe("Relatório.pdf");
  });
});

describe("nomeDoAnexoParaEnviar", () => {
  it("o nome original vence o basename aleatório do bucket", () => {
    expect(nomeDoAnexoParaEnviar("Relatório de atendimento.pdf", CAMINHO)).toBe(
      "Relatório de atendimento.pdf",
    );
  });

  it("sem nome original, usa o basename do bucket", () => {
    const fallback = nomeDoAnexoParaEnviar(undefined, CAMINHO);
    expect(fallback).toBe("out-3f9a2b1c-1111-4222-8333-444455556666.pdf");
    expect(nomeOriginalDaMensagem({ media_filename: fallback })).toBe(fallback);
    expect(nomeDoAnexoParaEnviar(null, CAMINHO)).toBe(
      "out-3f9a2b1c-1111-4222-8333-444455556666.pdf",
    );
  });

  it("prefere o nome explícito ao legado e usa o legado quando o explícito falta", () => {
    expect(nomeDoAnexoParaEnviar("Escolhido.pdf", CAMINHO, "Legado.pdf")).toBe("Escolhido.pdf");
    const nomeLegado = nomeDoAnexoParaEnviar(undefined, CAMINHO, "../pasta/Relatorio.pdf");
    expect(nomeLegado).toBe("..-pasta-Relatorio.pdf");
    expect(nomeOriginalDaMensagem({ media_filename: nomeLegado })).toBe(nomeLegado);
  });

  it("ignora nome explícito invisível e usa o legado sanitizado", () => {
    expect(nomeDoAnexoParaEnviar("\u200e\u200f", CAMINHO, "Legado.pdf")).toBe("Legado.pdf");
  });

  it("não envia separadores nem caracteres invisíveis no nome", () => {
    expect(nomeDoAnexoParaEnviar("../pasta\\relatorio.pdf", CAMINHO)).toBe("..-pasta-relatorio.pdf");
    expect(nomeDoAnexoParaEnviar("\u200e\u200f", CAMINHO)).toBe(
      "out-3f9a2b1c-1111-4222-8333-444455556666.pdf",
    );
  });
});
