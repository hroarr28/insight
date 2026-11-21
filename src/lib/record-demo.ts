import { readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chunkText } from "./chunker.ts";
import { buildSystemPrompt, formatContext } from "./grounding.ts";
import { ollamaChat, ollamaEmbed, ollamaSettings, type OllamaFetch } from "./ollama-client.ts";
import type { ReplayFile, ReplaySource } from "./replay.ts";
import { parseSamplePlan, questionTexts, type SamplePlan } from "./sample-plan.ts";

const PASSAGES_PER_ANSWER = 4;

export function cosine(left: number[], right: number[]): number {
  const length = Math.min(left.length, right.length);
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] * left[index];
    rightNorm += right[index] * right[index];
  }
  if (leftNorm === 0 || rightNorm === 0) return 0;
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

export interface RecordDocument {
  id?: string;
  name: string;
  text: string;
}

export interface RecordInput {
  documents: RecordDocument[];
  questions: string[];
  chatModel: string;
  embedModel: string;
  baseUrl: string;
  embed: (texts: string[]) => Promise<number[][]>;
  answer: (question: string, context: string) => Promise<string>;
  recordedAt?: string;
  onQuestion?: (event: QuestionProgress) => void;
}

export interface QuestionProgress {
  index: number;
  total: number;
  question: string;
  phase: "start" | "success" | "failure";
  elapsedMs?: number;
  error?: string;
}

export function sampleDocumentId(name: string): string {
  const slug = name
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `sample-${slug || "document"}`;
}

export function readSampleDocuments(root: string, plan: SamplePlan): RecordDocument[] {
  return plan.documents.map((document) => {
    const full = path.resolve(root, document.path);
    const relative = path.relative(root, full);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error(`Sample path escapes the project: ${document.path}`);
    }
    return {
      id: sampleDocumentId(document.name),
      name: document.name,
      text: readFileSync(full, "utf8"),
    };
  });
}

export async function buildReplay(input: RecordInput): Promise<ReplayFile> {
  if (input.documents.length === 0) throw new Error("Sample documents are missing");
  const indexed = input.documents.flatMap((document) =>
    chunkText(document.text).map((chunk) => ({ document, chunk }))
  );
  if (indexed.length === 0) throw new Error("Sample documents produced no chunks");
  const vectors = await input.embed(indexed.map((item) => item.chunk.content));
  if (vectors.length !== indexed.length) throw new Error("Embedding count does not match chunks");

  const questions = [];
  const total = input.questions.length;
  for (const [index, question] of input.questions.entries()) {
    const started = Date.now();
    input.onQuestion?.({ index, total, question, phase: "start" });
    try {
      const [queryVector] = await input.embed([question]);
      if (!queryVector) throw new Error("Question embedding was empty");
      const ranked = indexed
        .map((item, chunkIndex) => ({
          item,
          similarity: cosine(queryVector, vectors[chunkIndex] ?? []),
        }))
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, PASSAGES_PER_ANSWER);
      const sources: ReplaySource[] = ranked.map(({ item, similarity }) => ({
        content: item.chunk.content,
        heading: item.chunk.metadata.heading ?? null,
        document_name: item.document.name,
        chunk_index: item.chunk.index,
        similarity,
      }));
      const context = formatContext(sources);
      const answer = (await input.answer(question, context)).trim();
      if (!answer) throw new Error(`Empty answer for: ${question}`);
      questions.push({
        id: `recorded-${index + 1}`,
        question,
        answer,
        sources,
      });
      input.onQuestion?.({
        index,
        total,
        question,
        phase: "success",
        elapsedMs: Date.now() - started,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Recording failed";
      input.onQuestion?.({
        index,
        total,
        question,
        phase: "failure",
        elapsedMs: Date.now() - started,
        error: message,
      });
      throw error;
    }
  }

  const counts = new Map<string, number>();
  for (const item of indexed) {
    counts.set(item.document.name, (counts.get(item.document.name) ?? 0) + 1);
  }

  return {
    recorded: true,
    note: `Recorded from local ${input.chatModel} with ${input.embedModel} embeddings. Not a paid API.`,
    chat_model: input.chatModel,
    embed_model: input.embedModel,
    ollama_base_url: input.baseUrl,
    recorded_at: input.recordedAt ?? new Date().toISOString(),
    documents: input.documents.map((document) => ({
      id: document.id ?? sampleDocumentId(document.name),
      name: document.name,
      file_type: "text/plain",
      chunk_count: counts.get(document.name) ?? 0,
      created_at: "2026-01-01T00:00:00.000Z",
    })),
    questions,
  };
}

export function writeReplay(filePath: string, replay: ReplayFile): void {
  const temporary = `${filePath}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(replay, null, 2)}\n`);
  renameSync(temporary, filePath);
}

export async function recordFromOllama(
  root: string,
  env: Record<string, string | undefined> = process.env,
  fetchImpl?: OllamaFetch
): Promise<ReplayFile> {
  const settings = ollamaSettings(env);
  const plan = parseSamplePlan(
    JSON.parse(readFileSync(path.join(root, "demo/questions.json"), "utf8"))
  );
  const documents = readSampleDocuments(root, plan);
  const replay = await buildReplay({
    documents,
    questions: questionTexts(plan),
    chatModel: settings.chatModel,
    embedModel: settings.embedModel,
    baseUrl: settings.baseUrl,
    embed: (texts) => ollamaEmbed(settings, texts, fetchImpl),
    answer: async (question, context) =>
      ollamaChat(settings, { system: buildSystemPrompt(context), prompt: question }, fetchImpl),
    onQuestion(event) {
      const prefix = `[demo:record] ${event.index + 1}/${event.total}`;
      if (event.phase === "start") {
        console.log(`${prefix} start: ${event.question}`);
        return;
      }
      const seconds = ((event.elapsedMs ?? 0) / 1000).toFixed(1);
      if (event.phase === "success") {
        console.log(`${prefix} ok in ${seconds}s: ${event.question}`);
        return;
      }
      console.error(`${prefix} failed in ${seconds}s: ${event.question}`);
      if (event.error) console.error(`[demo:record] ${event.error}`);
    },
  });
  writeReplay(path.join(root, "demo/replay.json"), replay);
  return replay;
}
