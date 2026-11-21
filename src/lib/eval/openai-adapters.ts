import { openai } from "@ai-sdk/openai";
import { embedMany, generateText } from "ai";
import type { Embedder } from "@/lib/eval/lexical";
import {
  buildJudgePrompt,
  parseFaithfulnessJudgement,
  type FaithfulnessJudge,
} from "@/lib/eval/judge";
import { buildSystemPrompt, formatContext } from "@/lib/grounding";
import { createLlmReranker } from "@/lib/rerank";
import type { ChunkHit, Reranker } from "@/lib/retrieval";

const EMBEDDING_BATCH = 64;

export function createOpenAIEmbedder(): Embedder {
  return {
    name: "text-embedding-3-small",
    async embed(texts) {
      const vectors: number[][] = [];
      for (let index = 0; index < texts.length; index += EMBEDDING_BATCH) {
        const { embeddings } = await embedMany({
          model: openai.embedding("text-embedding-3-small"),
          values: texts.slice(index, index + EMBEDDING_BATCH),
        });
        vectors.push(...embeddings);
      }
      return vectors;
    },
  };
}

export function createOpenAIReranker(): Reranker {
  const reranker = createLlmReranker(async (prompt) => {
    const { text } = await generateText({
      model: openai("gpt-4o-mini"),
      temperature: 0,
      prompt,
    });
    return text;
  });
  return { name: "gpt-4o-mini", rerank: reranker.rerank.bind(reranker) };
}

export function createOpenAIJudge(): FaithfulnessJudge {
  return {
    name: "gpt-4o-mini",
    async judge(input) {
      const { text } = await generateText({
        model: openai("gpt-4o-mini"),
        temperature: 0,
        prompt: buildJudgePrompt(input),
      });
      const verdict = parseFaithfulnessJudgement(text);
      if (!verdict) {
        throw new Error("Faithfulness judge returned an unreadable verdict");
      }
      return verdict;
    },
  };
}

export async function openAIAnswer(question: string, chunks: ChunkHit[]): Promise<string> {
  const { text } = await generateText({
    model: openai("gpt-4o-mini"),
    temperature: 0,
    system: buildSystemPrompt(formatContext(chunks)),
    prompt: question,
  });
  return text;
}
