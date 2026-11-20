import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { extractiveAnswer } from "../src/lib/eval/answer";
import { heuristicJudge } from "../src/lib/eval/judge";
import { createLexicalReranker, hashingEmbedder } from "../src/lib/eval/lexical";
import { renderMarkdown } from "../src/lib/eval/report";
import { runEvaluation, type EvalRuntime } from "../src/lib/eval/run";
import type { EvalDocument, EvalQuestion, JudgeControl } from "../src/lib/eval/types";

const OFFLINE_NOTE =
  "Offline fixture run. Embeddings are a 256-dimensional hashing bag of words, not OpenAI text-embedding-3-small. Full-text ranking is in-memory BM25 with a light stemmer, not Postgres ts_rank_cd. The reranker counts token overlap; it is not gpt-4o-mini. The faithfulness judge is a 6-word overlap heuristic. Vector candidates use no cosine floor because hashing scores are not on the production 0.3 scale. This file proves the harness runs. It is not a measurement of the deployed stack.";

const LIVE_NOTE =
  "Live OpenAI run. Embeddings are text-embedding-3-small and the vector leg uses the production cosine floor of 0.3. Full-text ranking is still the in-memory BM25 stand-in, not the Supabase search_documents_fts RPC, and nothing is written to the database. Reranking, answers, and the faithfulness judge use gpt-4o-mini at temperature 0. The answer prompt is the same system prompt as /api/ask.";

function loadDocuments(root: string): EvalDocument[] {
  const directory = path.join(root, "eval/corpus");
  return readdirSync(directory)
    .filter((name) => name.endsWith(".txt"))
    .sort()
    .map((name) => ({
      name,
      text: readFileSync(path.join(directory, name), "utf8"),
    }));
}

function loadQuestions(root: string, documents: EvalDocument[]): EvalQuestion[] {
  const raw: unknown = JSON.parse(readFileSync(path.join(root, "eval/questions.json"), "utf8"));
  if (!raw || typeof raw !== "object" || !Array.isArray((raw as { questions?: unknown }).questions)) {
    throw new Error("eval/questions.json must contain a questions array");
  }
  const byName = new Map(documents.map((document) => [document.name, document.text]));
  const questions = (raw as { questions: EvalQuestion[] }).questions;
  for (const question of questions) {
    const text = byName.get(question.document);
    if (!text) throw new Error(`${question.id} points at a missing document`);
    if (!Array.isArray(question.gold_quotes) || question.gold_quotes.length === 0) {
      throw new Error(`${question.id} has no gold quotes`);
    }
    for (const quote of question.gold_quotes) {
      const inDocument = text.split(quote).length - 1;
      const inCorpus = documents.reduce(
        (count, document) => count + (document.text.split(quote).length - 1),
        0
      );
      if (inDocument !== 1 || inCorpus !== 1) {
        throw new Error(`${question.id} quote is not unique in the corpus: ${quote}`);
      }
    }
  }
  return questions;
}

function loadControls(root: string): JudgeControl[] {
  const raw: unknown = JSON.parse(
    readFileSync(path.join(root, "eval/judge-controls.json"), "utf8")
  );
  if (!Array.isArray(raw)) throw new Error("eval/judge-controls.json must be an array");
  return raw as JudgeControl[];
}

async function runtime(live: boolean): Promise<EvalRuntime> {
  if (!live) {
    return {
      embedder: hashingEmbedder,
      reranker: createLexicalReranker(),
      judge: heuristicJudge,
      answerer: async (question, chunks) => extractiveAnswer(question, chunks),
      vectorThreshold: 0,
      fullTextName: "in-memory-bm25",
      mode: "offline-fixture",
      note: OFFLINE_NOTE,
    };
  }

  if (!process.env.OPENAI_API_KEY) {
    console.error(
      "npm run eval:live needs OPENAI_API_KEY in the environment. It does not use Supabase. No request was sent."
    );
    process.exit(1);
  }

  const adapters = await import("../src/lib/eval/openai-adapters");
  return {
    embedder: adapters.createOpenAIEmbedder(),
    reranker: adapters.createOpenAIReranker(),
    judge: adapters.createOpenAIJudge(),
    answerer: adapters.openAIAnswer,
    vectorThreshold: 0.3,
    fullTextName: "in-memory-bm25",
    mode: "live",
    note: LIVE_NOTE,
  };
}

async function main(): Promise<void> {
  const live = process.argv.includes("--live");
  const root = process.cwd();
  const documents = loadDocuments(root);
  const questions = loadQuestions(root, documents);
  const controls = loadControls(root);
  const report = await runEvaluation(documents, questions, controls, await runtime(live));
  const markdown = renderMarkdown(report);
  const directory = path.join(root, "eval/results");
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, "latest.json"), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(path.join(directory, "latest.md"), markdown);
  console.log(markdown);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "eval failed";
  console.error(message);
  process.exit(1);
});
