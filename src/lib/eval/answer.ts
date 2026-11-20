import type { ChunkHit } from "@/lib/retrieval";

export const ABSTENTION =
  "I can only answer from the uploaded documents, and I could not find a relevant passage.";

function firstSentence(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  const match = /^.{40,}?[.!?](?=\s|$)/.exec(normalized);
  if (match) return match[0];
  return normalized.slice(0, 240);
}

/** Copies a sentence from the top passage and cites it. Offline stand-in for the chat model. */
export function extractiveAnswer(_question: string, chunks: ChunkHit[]): string {
  const top = chunks[0];
  if (!top) return ABSTENTION;
  return `${firstSentence(top.content)} [Source 1]`;
}
