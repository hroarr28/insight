import { readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chunkText } from "./chunker.ts";
import { buildSystemPrompt, formatContext } from "./grounding.ts";
import { ollamaChat, ollamaEmbed, ollamaSettings, type OllamaFetch } from "./ollama-client.ts";
import type { ReplayFile, ReplaySource } from "./replay.ts";

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

export interface RecordInput {
  documentName: string;
  documentText: string;
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

export async function buildReplay(input: RecordInput): Promise<ReplayFile> {
  const chunks = chunkText(input.documentText);
  if (chunks.length === 0) throw new Error("Sample document produced no chunks");
  const vectors = await input.embed(chunks.map((chunk) => chunk.content));
  if (vectors.length !== chunks.length) throw new Error("Embedding count does not match chunks");

  const questions = [];
  const total = input.questions.length;
  for (const [index, question] of input.questions.entries()) {
    const started = Date.now();
    input.onQuestion?.({ index, total, question, phase: "start" });
    try {
      const [queryVector] = await input.embed([question]);
      if (!queryVector) throw new Error("Question embedding was empty");
      const ranked = chunks
        .map((chunk, chunkIndex) => ({
          chunk,
          similarity: cosine(queryVector, vectors[chunkIndex] ?? []),
        }))
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 4);
      const sources: ReplaySource[] = ranked.map((item) => ({
        content: item.chunk.content,
        heading: item.chunk.metadata.heading ?? null,
        document_name: input.documentName,
        chunk_index: item.chunk.index,
        similarity: item.similarity,
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

  return {
    recorded: true,
    note: `Recorded from local ${input.chatModel} with ${input.embedModel} embeddings. Not a paid API.`,
    chat_model: input.chatModel,
    embed_model: input.embedModel,
    ollama_base_url: input.baseUrl,
    recorded_at: input.recordedAt ?? new Date().toISOString(),
    documents: [
      {
        id: "sample-pocket-sundial",
        name: input.documentName,
        file_type: "text/plain",
        chunk_count: chunks.length,
        created_at: "2026-01-01T00:00:00.000Z",
      },
    ],
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
  const questionsFile = JSON.parse(
    readFileSync(path.join(root, "demo/questions.json"), "utf8")
  ) as { document?: string; document_name?: string; questions?: unknown };
  if (!Array.isArray(questionsFile.questions) || questionsFile.questions.some((item) => typeof item !== "string")) {
    throw new Error("demo/questions.json must list question strings");
  }
  const documentPath = path.join(root, questionsFile.document ?? "samples/pocket-sundial.txt");
  const documentText = readFileSync(documentPath, "utf8");
  const documentName = questionsFile.document_name ?? path.basename(documentPath);
  const replay = await buildReplay({
    documentName,
    documentText,
    questions: questionsFile.questions as string[],
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
