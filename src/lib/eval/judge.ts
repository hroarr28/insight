import { ABSTENTION } from "@/lib/eval/answer";
import { parseJsonObject } from "@/lib/parse-json";

export interface FaithfulnessInput {
  question: string;
  answer: string;
  sources: string[];
}

export interface FaithfulnessVerdict {
  faithful: boolean;
  unsupported_claims: string[];
}

export interface FaithfulnessJudge {
  readonly name: string;
  judge(input: FaithfulnessInput): Promise<FaithfulnessVerdict>;
}

export const FAITHFULNESS_JUDGE_PROMPT = `You are a strict faithfulness judge for a retrieval-augmented answer.

You are given a question, an answer, and the passages the answer cites. Decide whether every factual claim in the answer is entailed by those passages.

Rules:
- Use only the cited passages. Do not use outside knowledge.
- A claim is supported only when the passages entail it, not when it is merely on the same topic.
- Citation markers such as [Source N] are not claims.
- If the answer says the documents do not contain the answer, and it does not add a factual claim, it is faithful.
- Unsupported, contradicted, or more specific claims fail.

Return JSON only:
{"faithful": false, "unsupported_claims": ["claim that is not entailed"]}`;

export const FAITHFULNESS_JUDGE_LIMITS = [
  "The live judge is gpt-4o-mini, the same family as the answer model, so the two can share a blind spot.",
  "The verdict is binary. A mostly supported answer fails if one claim is unsupported.",
  "The judge sees only the passages the answer cites. It does not check that [Source N] points at the right passage. That is citation accuracy.",
  "The verdict moves when the prompt changes. The prompt above is the one the harness sends.",
  "The offline judge is a lexical heuristic, not the model. A sentence passes when any contiguous 6-word span appears in the cited text, so a true clause joined to a false one in the same sentence can pass.",
  "The offline heuristic only recognises two abstention sentences: the extractive fallback, and \"The documents do not contain enough information to answer.\" Other wordings are judged as ordinary claims.",
];

const SECOND_ABSTENTION = "The documents do not contain enough information to answer.";

export function buildJudgePrompt(input: FaithfulnessInput): string {
  const passages =
    input.sources.length === 0
      ? "(no passages cited)"
      : input.sources.map((source, index) => `[Source ${index + 1}]\n${source}`).join("\n\n");

  return `${FAITHFULNESS_JUDGE_PROMPT}

Question:
${input.question}

Answer:
${input.answer}

Cited passages:
${passages}`;
}

export function parseFaithfulnessJudgement(raw: string): FaithfulnessVerdict | null {
  let parsed: unknown;
  try {
    parsed = parseJsonObject(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const faithful = (parsed as { faithful?: unknown }).faithful;
  const claims = (parsed as { unsupported_claims?: unknown }).unsupported_claims;
  if (typeof faithful !== "boolean") return null;
  if (!Array.isArray(claims) || claims.some((claim) => typeof claim !== "string")) {
    return null;
  }
  return { faithful, unsupported_claims: claims as string[] };
}

function words(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? []);
}

function isAbstention(answer: string): boolean {
  const stripped = answer.replace(/\[Source\s+\d+\]/gi, "").replace(/\s+/g, " ").trim();
  const canonical = stripped.endsWith(".") ? stripped : `${stripped}.`;
  return canonical === ABSTENTION || canonical === `${SECOND_ABSTENTION}`;
}

function sentenceSupported(sentence: string, haystack: string): boolean {
  const tokens = words(sentence);
  if (tokens.length < 4) return true;
  const span = Math.min(6, tokens.length);
  const hay = words(haystack).join(" ");
  for (let index = 0; index + span <= tokens.length; index += 1) {
    if (hay.includes(tokens.slice(index, index + span).join(" "))) return true;
  }
  return false;
}

export function judgeHeuristically(input: FaithfulnessInput): FaithfulnessVerdict {
  if (isAbstention(input.answer)) {
    return { faithful: true, unsupported_claims: [] };
  }

  const stripped = input.answer.replace(/\[Source\s+\d+\]/gi, " ");
  const sentences = stripped
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => words(sentence).length >= 4);

  if (sentences.length === 0) {
    return { faithful: false, unsupported_claims: [stripped.trim() || "(empty answer)"] };
  }

  const haystack = input.sources.join("\n");
  const unsupported = sentences.filter((sentence) => !sentenceSupported(sentence, haystack));
  return { faithful: unsupported.length === 0, unsupported_claims: unsupported };
}

export const heuristicJudge: FaithfulnessJudge = {
  name: "heuristic-6gram",
  async judge(input) {
    return judgeHeuristically(input);
  },
};
