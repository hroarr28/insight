import { describe, expect, it } from "vitest";
import {
  databaseEmbeddingMismatch,
  DB_EMBEDDING_DIMENSIONS,
  ollamaOpenAICompatibleBaseUrl,
  resolveProviderConfig,
} from "@/lib/providers/config";

describe("resolveProviderConfig", () => {
  it("defaults to the deployed OpenAI models and 1536 dimensions", () => {
    const config = resolveProviderConfig({});
    expect(config.provider).toBe("openai");
    expect(config.chatModel).toBe("gpt-4o-mini");
    expect(config.embedModel).toBe("text-embedding-3-small");
    expect(config.embeddingDimensions).toBe(DB_EMBEDDING_DIMENSIONS);
    expect(databaseEmbeddingMismatch(config)).toBeNull();
  });

  it("selects Ollama defaults, including embeddinggemma at 768 dimensions", () => {
    const config = resolveProviderConfig({ LLM_PROVIDER: "ollama" });
    expect(config).toMatchObject({
      provider: "ollama",
      chatModel: "gemma4:31b",
      embedModel: "embeddinggemma",
      embeddingDimensions: 768,
      ollamaBaseUrl: "http://127.0.0.1:11434",
    });
    expect(databaseEmbeddingMismatch(config)).toContain("vector(1536)");
    expect(databaseEmbeddingMismatch(config)).toContain("npm run eval:local");
    expect(databaseEmbeddingMismatch(config)).toContain("ollama pull embeddinggemma");
  });

  it("honours explicit Ollama model tags and strips a trailing slash", () => {
    const config = resolveProviderConfig({
      LLM_PROVIDER: "ollama",
      OLLAMA_BASE_URL: "http://127.0.0.1:11434/",
      OLLAMA_CHAT_MODEL: "gemma4:31b",
      OLLAMA_EMBED_MODEL: "nomic-embed-text",
      OLLAMA_EMBED_DIMENSIONS: "768",
    });
    expect(config.ollamaBaseUrl).toBe("http://127.0.0.1:11434");
    expect(config.embedModel).toBe("nomic-embed-text");
    expect(ollamaOpenAICompatibleBaseUrl(config.ollamaBaseUrl)).toBe(
      "http://127.0.0.1:11434/v1"
    );
  });

  it("rejects an unknown provider and a bad dimension", () => {
    expect(() => resolveProviderConfig({ LLM_PROVIDER: "azure" })).toThrow(/openai or ollama/);
    expect(() =>
      resolveProviderConfig({ LLM_PROVIDER: "ollama", OLLAMA_EMBED_DIMENSIONS: "wide" })
    ).toThrow(/OLLAMA_EMBED_DIMENSIONS/);
  });
});
