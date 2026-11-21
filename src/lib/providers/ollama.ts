import {
  DEFAULT_OLLAMA_CHAT_MODEL,
  DEFAULT_OLLAMA_EMBED_MODEL,
  type ProviderConfig,
} from "@/lib/providers/config";

export interface OllamaFetch {
  (url: string, init?: RequestInit): Promise<Response>;
}

const EMBED_BATCH = 16;

export async function ollamaEmbed(
  config: ProviderConfig,
  texts: string[],
  fetchImpl: OllamaFetch = fetch
): Promise<number[][]> {
  if (texts.length === 0) return [];
  const vectors: number[][] = [];
  for (let index = 0; index < texts.length; index += EMBED_BATCH) {
    const batch = texts.slice(index, index + EMBED_BATCH);
    const response = await fetchImpl(`${config.ollamaBaseUrl}/api/embed`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: config.embedModel,
        input: batch,
        truncate: true,
      }),
    });
    if (!response.ok) {
      throw new Error(`Ollama embeddings failed (${response.status})`);
    }
    const body = (await response.json()) as { embeddings?: unknown };
    if (!Array.isArray(body.embeddings) || body.embeddings.length !== batch.length) {
      throw new Error("Ollama returned an unexpected embeddings payload");
    }
    for (const vector of body.embeddings) {
      if (!Array.isArray(vector) || vector.some((value) => typeof value !== "number")) {
        throw new Error("Ollama returned a non-numeric embedding");
      }
      if (vector.length !== config.embeddingDimensions) {
        throw new Error(
          `Ollama model ${config.embedModel} returned ${vector.length} dimensions, expected ${config.embeddingDimensions}. Set OLLAMA_EMBED_DIMENSIONS to the model width.`
        );
      }
      vectors.push(vector);
    }
  }
  return vectors;
}

export async function ollamaGenerate(
  config: ProviderConfig,
  input: { prompt: string; system?: string },
  fetchImpl: OllamaFetch = fetch
): Promise<string> {
  const messages = [];
  if (input.system) messages.push({ role: "system", content: input.system });
  messages.push({ role: "user", content: input.prompt });

  const response = await fetchImpl(`${config.ollamaBaseUrl}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: config.chatModel,
      messages,
      stream: false,
      options: { temperature: 0 },
    }),
  });
  if (!response.ok) {
    throw new Error(`Ollama chat failed (${response.status})`);
  }
  const body = (await response.json()) as { message?: { content?: unknown } };
  if (typeof body.message?.content !== "string" || !body.message.content.trim()) {
    throw new Error("Ollama chat returned an empty message");
  }
  return body.message.content;
}

function modelNames(body: unknown): string[] {
  if (!body || typeof body !== "object" || !Array.isArray((body as { models?: unknown }).models)) {
    return [];
  }
  return (body as { models: { name?: unknown }[] }).models
    .map((model) => (typeof model.name === "string" ? model.name : ""))
    .filter((name) => name.length > 0);
}

export function ollamaHasModel(installed: string[], wanted: string): boolean {
  return installed.some(
    (name) => name === wanted || name === `${wanted}:latest` || wanted === `${name}:latest`
  );
}

/** Fails with the exact pull command when a model is not installed. Does not print prompts. */
export async function assertOllamaModels(
  config: ProviderConfig,
  fetchImpl: OllamaFetch = fetch
): Promise<void> {
  let response: Response;
  try {
    response = await fetchImpl(`${config.ollamaBaseUrl}/api/tags`);
  } catch {
    throw new Error(
      `Ollama is not reachable at ${config.ollamaBaseUrl}. Start it, then run: ollama pull ${config.embedModel}`
    );
  }
  if (!response.ok) {
    throw new Error(
      `Ollama at ${config.ollamaBaseUrl} returned ${response.status}. Start it, then run: ollama pull ${config.embedModel}`
    );
  }
  const installed = modelNames(await response.json());
  const missing = [config.chatModel, config.embedModel].filter(
    (model, index, all) => all.indexOf(model) === index && !ollamaHasModel(installed, model)
  );
  if (missing.length === 0) return;
  const pulls = missing.map((model) => `ollama pull ${model}`).join("\n");
  throw new Error(`Ollama is missing ${missing.join(", ")}.\n${pulls}`);
}

export const RECOMMENDED_OLLAMA_PULLS = [
  `ollama pull ${DEFAULT_OLLAMA_CHAT_MODEL}`,
  `ollama pull ${DEFAULT_OLLAMA_EMBED_MODEL}`,
] as const;
