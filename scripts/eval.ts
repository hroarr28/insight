import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { extractiveAnswer } from "../src/lib/eval/answer";
import { createCachedEmbedder } from "../src/lib/eval/embedding-cache";
import { describeHardware } from "../src/lib/eval/hardware";
import { heuristicJudge } from "../src/lib/eval/judge";
import { createLexicalReranker, hashingEmbedder } from "../src/lib/eval/lexical";
import { localEvalNote } from "../src/lib/eval/local-note";
import { renderMarkdown } from "../src/lib/eval/report";
import { runEvaluation, type EvalRuntime } from "../src/lib/eval/run";
import type { EvalDocument, EvalQuestion, JudgeControl } from "../src/lib/eval/types";
import {
  createOllamaTextProvider,
  createProviderJudge,
  createProviderReranker,
  providerAnswer,
} from "../src/lib/providers";
import { resolveProviderConfig } from "../src/lib/providers/config";
import { assertOllamaModels } from "../src/lib/providers/ollama";

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

async function localRuntime(root: string): Promise<EvalRuntime> {
  const config = resolveProviderConfig({ ...process.env, LLM_PROVIDER: "ollama" });
  await assertOllamaModels(config);
  const provider = createOllamaTextProvider(config);
  const cachePath = path.join(root, "eval/cache", `${config.embedModel.replace(/[^a-zA-Z0-9._-]/g, "_")}.json`);
  const embedder = createCachedEmbedder(
    { name: `ollama:${config.embedModel}`, embed: (texts) => provider.embed(texts) },
    cachePath,
    config.embeddingDimensions,
    {
      onProgress(done, total) {
        console.log(`embedded ${done}/${total} new chunks`);
      },
    }
  );
  return {
    embedder,
    reranker: createProviderReranker(provider),
    judge: createProviderJudge(provider),
    answerer: (question, chunks) => providerAnswer(provider, question, chunks),
    vectorThreshold: 0,
    fullTextName: "in-memory-bm25-or-lexemes",
    mode: "local-ollama",
    note: localEvalNote(config),
    hardware: describeHardware(),
    models: {
      chat: config.chatModel,
      embed: config.embedModel,
      embedding_dimensions: config.embeddingDimensions,
      reranker: config.chatModel,
      judge: config.chatModel,
    },
  };
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
  const local = process.argv.includes("--local");
  if (live && local) {
    console.error("Choose one of --live or --local.");
    process.exit(1);
  }
  const root = process.cwd();
  const documents = loadDocuments(root);
  const questions = loadQuestions(root, documents);
  const controls = loadControls(root);
  const report = await runEvaluation(
    documents,
    questions,
    controls,
    local ? await localRuntime(root) : await runtime(live)
  );
  const markdown = renderMarkdown(report);
  const directory = path.join(root, "eval/results");
  mkdirSync(directory, { recursive: true });
  const stem = local ? "local" : "latest";
  writeFileSync(path.join(directory, `${stem}.json`), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(path.join(directory, `${stem}.md`), markdown);
  console.log(markdown);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "eval failed";
  console.error(message);
  process.exit(1);
});
