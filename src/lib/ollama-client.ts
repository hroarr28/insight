export interface OllamaSettings {
  baseUrl: string;
  chatModel: string;
  embedModel: string;
}

export interface OllamaFetch {
  (url: string, init?: RequestInit): Promise<Response>;
}

export function ollamaSettings(
  env: Record<string, string | undefined> = process.env
): OllamaSettings {
  const base = (env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434").trim().replace(/\/$/, "");
  return {
    baseUrl: base || "http://127.0.0.1:11434",
    chatModel: env.OLLAMA_CHAT_MODEL?.trim() || "gemma4:31b",
    embedModel: env.OLLAMA_EMBED_MODEL?.trim() || "embeddinggemma",
  };
}

export async function ollamaEmbed(
  settings: OllamaSettings,
  texts: string[],
  fetchImpl: OllamaFetch = fetch
): Promise<number[][]> {
  if (texts.length === 0) return [];
  const vectors: number[][] = [];
  for (let index = 0; index < texts.length; index += 16) {
    const batch = texts.slice(index, index + 16);
    const response = await fetchImpl(`${settings.baseUrl}/api/embed`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: settings.embedModel, input: batch, truncate: true }),
    });
    if (!response.ok) throw new Error(`Ollama embeddings failed (${response.status})`);
    const body = (await response.json()) as { embeddings?: unknown };
    if (!Array.isArray(body.embeddings) || body.embeddings.length !== batch.length) {
      throw new Error("Ollama returned an unexpected embeddings payload");
    }
    for (const vector of body.embeddings) {
      if (!Array.isArray(vector) || vector.some((value) => typeof value !== "number")) {
        throw new Error("Ollama returned a non-numeric embedding");
      }
      vectors.push(vector as number[]);
    }
  }
  return vectors;
}

export async function ollamaChat(
  settings: OllamaSettings,
  input: { system: string; prompt: string },
  fetchImpl: OllamaFetch = fetch
): Promise<string> {
  const response = await fetchImpl(`${settings.baseUrl}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: settings.chatModel,
      stream: false,
      options: { temperature: 0 },
      messages: [
        { role: "system", content: input.system },
        { role: "user", content: input.prompt },
      ],
    }),
  });
  if (!response.ok) throw new Error(`Ollama chat failed (${response.status})`);
  const body = (await response.json()) as { message?: { content?: unknown } };
  if (typeof body.message?.content !== "string" || !body.message.content.trim()) {
    throw new Error("Ollama chat returned an empty message");
  }
  return body.message.content;
}
