import { createOpenAI, openai } from "@ai-sdk/openai";
import { embedMany, generateText } from "ai";
import { createLlmReranker } from "@/lib/rerank";
import type { Reranker } from "@/lib/retrieval";
import {
  buildJudgePrompt,
  parseFaithfulnessJudgement,
  type FaithfulnessJudge,
} from "@/lib/eval/judge";
import { buildSystemPrompt, formatContext } from "@/lib/grounding";
import type { ChunkHit } from "@/lib/retrieval";
import {
  ollamaOpenAICompatibleBaseUrl,
  resolveProviderConfig,
  type ProviderConfig,
} from "@/lib/providers/config";
import { ollamaEmbed, ollamaGenerate, type OllamaFetch } from "@/lib/providers/ollama";

export interface TextProvider {
  readonly config: ProviderConfig;
  embed(texts: string[]): Promise<number[][]>;
  generate(input: { prompt: string; system?: string }): Promise<string>;
}

export function createOpenAITextProvider(config: ProviderConfig): TextProvider {
  return {
    config,
    async embed(texts) {
      if (texts.length === 0) return [];
      const { embeddings } = await embedMany({
        model: openai.embedding(config.embedModel),
        values: texts,
      });
      return embeddings;
    },
    async generate(input) {
      const { text } = await generateText({
        model: openai(config.chatModel),
        temperature: 0,
        system: input.system,
        prompt: input.prompt,
      });
      return text;
    },
  };
}

export function createOllamaTextProvider(
  config: ProviderConfig,
  fetchImpl: OllamaFetch = fetch
): TextProvider {
  return {
    config,
    embed(texts) {
      return ollamaEmbed(config, texts, fetchImpl);
    },
    generate(input) {
      return ollamaGenerate(config, input, fetchImpl);
    },
  };
}

export function getTextProvider(
  env: Record<string, string | undefined> = process.env
): TextProvider {
  const config = resolveProviderConfig(env);
  if (config.provider === "ollama") return createOllamaTextProvider(config);
  return createOpenAITextProvider(config);
}

/** OpenAI keeps the existing client. Ollama streams through its OpenAI-compatible /v1 endpoint. */
export function chatLanguageModel(
  env: Record<string, string | undefined> = process.env
) {
  const config = resolveProviderConfig(env);
  if (config.provider === "openai") return openai(config.chatModel);
  return createOpenAI({
    baseURL: ollamaOpenAICompatibleBaseUrl(config.ollamaBaseUrl),
    apiKey: "ollama",
    name: "ollama",
  }).chat(config.chatModel);
}

export function createProviderReranker(provider: TextProvider): Reranker {
  const reranker = createLlmReranker((prompt) => provider.generate({ prompt }));
  return {
    name: `${provider.config.provider}:${provider.config.chatModel}`,
    rerank: (query, chunks, limit) => reranker.rerank(query, chunks, limit),
  };
}

export function createProviderJudge(provider: TextProvider): FaithfulnessJudge {
  return {
    name: `${provider.config.provider}:${provider.config.chatModel}`,
    async judge(input) {
      const text = await provider.generate({ prompt: buildJudgePrompt(input) });
      const verdict = parseFaithfulnessJudgement(text);
      if (!verdict) throw new Error("Faithfulness judge returned an unreadable verdict");
      return verdict;
    },
  };
}

export async function providerAnswer(
  provider: TextProvider,
  question: string,
  chunks: ChunkHit[]
): Promise<string> {
  return provider.generate({
    system: buildSystemPrompt(formatContext(chunks)),
    prompt: question,
  });
}
