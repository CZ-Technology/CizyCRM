/**
 * Nome original de um anexo recebido, pronto para ser gravado e exibido (#2613).
 *
 * O nome vem de fora (do aparelho de quem mandou), então passa por aqui antes de
 * virar `metadata.media_filename` e antes de virar rótulo no Inbox: caracteres
 * de controle e de formatação de direção de texto saem, as pontas são aparadas e
 * o tamanho tem teto. Guarda por VALOR: não-string, vazio ou só-invisível → null.
 */
const INVISIVEIS = /[\u0000-\u001F\u007F-\u009F\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;

/**
 * A mesma classe, exportada para o envio (#4524) — a limpeza é UMA. Uma segunda
 * cópia da regex no caminho de saída divergiria da de entrada no primeiro
 * caractere novo que alguém acrescentasse.
 */
export const INVISIVEIS_DO_NOME = INVISIVEIS;

/** Teto em caracteres (code points) — o limite usual de nome de arquivo. */
export const NOME_DE_ARQUIVO_MAX = 255;

export function nomeDeArquivoLimpo(bruto: unknown): string | null {
  if (typeof bruto !== "string") return null;
  const nome = Array.from(bruto.replace(INVISIVEIS, "").trim())
    .slice(0, NOME_DE_ARQUIVO_MAX)
    .join("")
    .trim();
  return nome ? nome : null;
}

/** Nome de documento de saída: impede separadores de caminho no anexo. */
export function nomeDeArquivoParaEnvio(bruto: unknown): string | null {
  const nome = nomeDeArquivoLimpo(bruto)?.replace(/[\\/]/g, "-").trim();
  return nome || null;
}

/** A chave de `messages.metadata` onde a ingestão guarda o nome (#2613). */
export const CHAVE_DO_NOME_NA_METADATA = "media_filename" as const;

/**
 * O nome original que a ingestão guardou em `metadata.media_filename`, lido por
 * VALOR — a mesma guarda de `nomeDeArquivoLimpo`, porque o JSONB é entrada de
 * fora. `null` quando não há nome: é ele que separa "mostre o nome" de "mostre
 * o fallback", e inventar um nome aqui contaminaria as duas pontas (o rótulo e
 * o `Content-Disposition` do download).
 */
export function nomeOriginalDaMensagem(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  return nomeDeArquivoLimpo(
    (metadata as Record<string, unknown>)[CHAVE_DO_NOME_NA_METADATA],
  );
}

/**
 * O nome que um anexo ENVIADO leva para o WhatsApp (#4457).
 *
 * O caminho no bucket é `out-<uuid>.<ext>` — nasce aleatório de propósito, para
 * dois arquivos de mesmo nome não se sobrescreverem. Usar o basename dele como
 * `filename` do documento é o que fazia o cliente ver `out-3f9a2b.pdf` no lugar
 * do nome que a pessoa escolheu.
 *
 * O nome explícito vence quando válido; depois vem `metadata.media_filename`
 * legado, pela mesma limpeza do fork. O basename fica como último recurso de
 * quem só manda o `media_storage_path`. O resultado é usado tanto na linha
 * quanto no payload do canal.
 */
export function nomeDoAnexoParaEnviar(
  original: unknown,
  storagePath: string,
  legado?: unknown,
): string | undefined {
  return (
    nomeDeArquivoParaEnvio(original) ??
    nomeDeArquivoParaEnvio(legado) ??
    (storagePath.split("/").pop() || undefined)
  );
}
