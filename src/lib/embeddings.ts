import { openai } from "@ai-sdk/openai";
import { embedMany, embed } from "ai";
import { liveProvider } from "./app-mode";
import { ollamaEmbed, ollamaSettings } from "./ollama-client";

const embeddingModel = openai.embedding("text-embedding-3-small");

export async function generateEmbeddings(
  texts: string[]
): Promise<number[][]> {
  if (liveProvider() === "ollama") {
    return ollamaEmbed(ollamaSettings(), texts);
  }
  const { embeddings } = await embedMany({
    model: embeddingModel,
    values: texts,
  });
  return embeddings;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const { embedding } = await embed({
    model: embeddingModel,
    value: text,
  });
  return embedding;
}
