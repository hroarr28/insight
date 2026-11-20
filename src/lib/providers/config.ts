export const DB_EMBEDDING_DIMENSIONS = 1536;

export const DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434";
export const DEFAULT_OLLAMA_CHAT_MODEL = "gemma4:31b";
export const DEFAULT_OLLAMA_EMBED_MODEL = "embeddinggemma";
export const DEFAULT_OLLAMA_EMBED_DIMENSIONS = 768;

export const DEFAULT_OPENAI_CHAT_MODEL = "gpt-4o-mini";
export const DEFAULT_OPENAI_EMBED_MODEL = "text-embedding-3-small";

export type ProviderName = "openai" | "ollama";

export interface ProviderConfig {
  provider: ProviderName;
  chatModel: string;
  embedModel: string;
  embeddingDimensions: number;
  ollamaBaseUrl: string;
}

export class EmbeddingDimensionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmbeddingDimensionError";
  }
}

function trimmed(value: string | undefined, fallback: string): string {
  const next = value?.trim();
  return next ? next : fallback;
}

function positiveInteger(value: string | undefined, fallback: number): number {
  if (!value?.trim()) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error("OLLAMA_EMBED_DIMENSIONS must be a positive integer");
  }
  return parsed;
}

/** Unset LLM_PROVIDER stays on OpenAI, which is the deployed path. */
export function resolveProviderConfig(
  env: Record<string, string | undefined> = process.env
): ProviderConfig {
  const raw = (env.LLM_PROVIDER ?? "openai").trim().toLowerCase();
  if (raw === "" || raw === "openai") {
    return {
      provider: "openai",
      chatModel: trimmed(env.OPENAI_CHAT_MODEL, DEFAULT_OPENAI_CHAT_MODEL),
      embedModel: trimmed(env.OPENAI_EMBED_MODEL, DEFAULT_OPENAI_EMBED_MODEL),
      embeddingDimensions: DB_EMBEDDING_DIMENSIONS,
      ollamaBaseUrl: "",
    };
  }
  if (raw === "ollama") {
    return {
      provider: "ollama",
      chatModel: trimmed(env.OLLAMA_CHAT_MODEL, DEFAULT_OLLAMA_CHAT_MODEL),
      embedModel: trimmed(env.OLLAMA_EMBED_MODEL, DEFAULT_OLLAMA_EMBED_MODEL),
      embeddingDimensions: positiveInteger(
        env.OLLAMA_EMBED_DIMENSIONS,
        DEFAULT_OLLAMA_EMBED_DIMENSIONS
      ),
      ollamaBaseUrl: trimmed(env.OLLAMA_BASE_URL, DEFAULT_OLLAMA_BASE_URL).replace(/\/$/, ""),
    };
  }
  throw new Error("LLM_PROVIDER must be openai or ollama");
}

/**
 * The Supabase column is vector(1536) for text-embedding-3-small.
 * A local model with another width must not be written there.
 * Returns null when the selected embedder matches the column.
 */
export function databaseEmbeddingMismatch(config: ProviderConfig): string | null {
  if (config.embeddingDimensions === DB_EMBEDDING_DIMENSIONS) return null;
  return (
    `The database stores vector(${DB_EMBEDDING_DIMENSIONS}) for ${DEFAULT_OPENAI_EMBED_MODEL}. ` +
    `${config.embedModel} returns ${config.embeddingDimensions} dimensions, so upload and search stay on the OpenAI path. ` +
    `Local eval does not use the database. Run npm run eval:local after ollama pull ${DEFAULT_OLLAMA_EMBED_MODEL}.`
  );
}

export function assertDatabaseEmbeddingDimensions(config = resolveProviderConfig()): void {
  const message = databaseEmbeddingMismatch(config);
  if (message) throw new EmbeddingDimensionError(message);
}

export function ollamaOpenAICompatibleBaseUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, "")}/v1`;
}
