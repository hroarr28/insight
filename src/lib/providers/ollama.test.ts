import { describe, expect, it } from "vitest";
import { resolveProviderConfig } from "@/lib/providers/config";
import {
  assertOllamaModels,
  ollamaEmbed,
  ollamaGenerate,
  ollamaHasModel,
  type OllamaFetch,
} from "@/lib/providers/ollama";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("ollama client", () => {
  const config = resolveProviderConfig({ LLM_PROVIDER: "ollama" });

  it("posts batched embed requests to the local daemon and checks the width", async () => {
    const urls: string[] = [];
    const fetchImpl: OllamaFetch = async (url, init) => {
      urls.push(url);
      const body = JSON.parse(String(init?.body));
      expect(body.model).toBe("embeddinggemma");
      expect(body.truncate).toBe(true);
      expect(String(url).startsWith("http://127.0.0.1:11434/")).toBe(true);
      return jsonResponse({
        embeddings: (body.input as string[]).map(() => [0.1, 0.2]),
      });
    };

    const narrow = { ...config, embeddingDimensions: 2 };
    const vectors = await ollamaEmbed(narrow, ["one", "two"], fetchImpl);
    expect(vectors).toEqual([
      [0.1, 0.2],
      [0.1, 0.2],
    ]);
    expect(urls).toEqual(["http://127.0.0.1:11434/api/embed"]);
  });

  it("rejects a vector whose width does not match the configured model", async () => {
    const fetchImpl: OllamaFetch = async () => jsonResponse({ embeddings: [[0.1]] });
    await expect(ollamaEmbed(config, ["one"], fetchImpl)).rejects.toThrow(/768/);
  });

  it("chats with stream off and temperature 0", async () => {
    let sent: { model?: string; stream?: boolean; options?: { temperature?: number } } = {};
    const fetchImpl: OllamaFetch = async (url, init) => {
      expect(url).toBe("http://127.0.0.1:11434/api/chat");
      sent = JSON.parse(String(init?.body));
      return jsonResponse({ message: { content: "cited [Source 1]" } });
    };
    const text = await ollamaGenerate(
      config,
      { system: "grounding", prompt: "question" },
      fetchImpl
    );
    expect(text).toBe("cited [Source 1]");
    expect(sent).toMatchObject({
      model: "gemma4:31b",
      stream: false,
      options: { temperature: 0 },
    });
  });

  it("names the pull command when a model is missing", async () => {
    const fetchImpl: OllamaFetch = async (url) => {
      expect(url).toBe("http://127.0.0.1:11434/api/tags");
      return jsonResponse({ models: [{ name: "gemma4:31b" }] });
    };
    await expect(assertOllamaModels(config, fetchImpl)).rejects.toThrow(
      "ollama pull embeddinggemma"
    );
  });

  it("treats a :latest tag as the same model", () => {
    expect(ollamaHasModel(["embeddinggemma:latest"], "embeddinggemma")).toBe(true);
    expect(ollamaHasModel(["gemma4:31b"], "gemma4:31b")).toBe(true);
    expect(ollamaHasModel(["other:latest"], "embeddinggemma")).toBe(false);
  });
});
