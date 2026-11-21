import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { liveConfigurationError, liveProvider, RECORDED_LABEL, resolveAppMode } from "./app-mode.ts";
import { buildReplay, readSampleDocuments } from "./record-demo.ts";
import { loadReplay, playbackFor, questionList } from "./replay.ts";
import { FICTIONAL_SAMPLE_NOTE, parseSamplePlan, questionTexts } from "./sample-plan.ts";
import { seedPlan } from "./seed-plan.ts";

const root = path.resolve(new URL("../..", import.meta.url).pathname);

describe("app mode", () => {
  it("stays in demo unless APP_MODE=live, even when a provider key is set", () => {
    assert.equal(resolveAppMode({}), "demo");
    assert.equal(resolveAppMode({ OPENAI_API_KEY: "present" }), "demo");
    assert.equal(resolveAppMode({ LLM_PROVIDER: "ollama" }), "demo");
    assert.equal(resolveAppMode({ OPENAI_API_KEY: "present", APP_MODE: "demo" }), "demo");
    assert.equal(resolveAppMode({ APP_MODE: "live", OPENAI_API_KEY: "present" }), "live");
    assert.equal(resolveAppMode({ APP_MODE: "live", LLM_PROVIDER: "ollama" }), "live");
    assert.equal(liveProvider({ LLM_PROVIDER: "ollama" }), "ollama");
    assert.equal(liveProvider({}), "openai");
    assert.match(liveConfigurationError({ APP_MODE: "live" }) ?? "", /OPENAI_API_KEY is missing/);
    assert.match(liveConfigurationError({ APP_MODE: "live" }) ?? "", /not used for this request/);
    assert.equal(liveConfigurationError({ APP_MODE: "live", LLM_PROVIDER: "ollama" }), null);
    assert.equal(liveConfigurationError({ APP_MODE: "live", OPENAI_API_KEY: "present" }), null);
    assert.equal(liveConfigurationError({ OPENAI_API_KEY: "present" }), null);
  });
});

describe("committed replay fixture", () => {
  const raw = JSON.parse(readFileSync(new URL("../../demo/replay.json", import.meta.url), "utf8"));
  const plan = parseSamplePlan(JSON.parse(readFileSync(path.join(root, "demo/questions.json"), "utf8")));

  it("plays the committed local gemma4 recording for each sample question", () => {
    const replay = loadReplay(raw);
    assert.equal(replay.recorded, true);
    assert.equal(replay.chat_model, "gemma4:31b");
    assert.equal(replay.embed_model, "embeddinggemma");
    assert.match(replay.note, /gemma4:31b/);
    assert.match(replay.note, /embeddinggemma/);
    assert.ok(replay.recorded_at, "a recording must have a timestamp");
    assert.deepEqual(questionList(replay), questionTexts(plan));
    assert.equal(replay.questions.length, 4);
    assert.deepEqual(
      replay.documents.map((document) => document.name),
      plan.documents.map((document) => document.name)
    );
    const names = new Set(plan.documents.map((document) => document.name));
    for (const question of replay.questions) {
      assert.equal(/sundial/i.test(question.question), false);
      const playback = playbackFor(replay, question.question);
      assert.equal(playback.recorded, true);
      assert.equal(playback.text, question.answer);
      assert.ok(playback.text.length > 0);
      assert.equal(playback.text.includes("not been recorded"), false);
      assert.ok(playback.sources.length > 0);
      assert.equal(playback.sources.length, question.sources.length);
      for (const source of playback.sources) {
        assert.equal(names.has(source.document_name), true);
      }
    }
  });

  it("does not play back answer text while recorded is false", () => {
    const replay = loadReplay({
      ...raw,
      recorded: false,
      questions: raw.questions.map((item: { question: string }) => ({
        ...item,
        answer: "This sentence was not produced by a model.",
        sources: [],
      })),
    });
    const playback = playbackFor(replay, raw.questions[0].question);
    assert.equal(playback.recorded, false);
    assert.equal(playback.text.includes("not been recorded"), true);
    assert.equal(playback.sources.length, 0);
  });
});

describe("recorded playback", () => {
  it("returns only a stored answer when the file is marked recorded", () => {
    const replay = loadReplay({
      recorded: true,
      note: "test recording",
      chat_model: "gemma4:31b",
      embed_model: "embeddinggemma",
      ollama_base_url: "http://127.0.0.1:11434",
      recorded_at: "2026-11-21T00:00:00.000Z",
      documents: [
        {
          id: "sample-visitor-badge-policy",
          name: "visitor-badge-policy.txt",
          file_type: "text/plain",
          chunk_count: 1,
          created_at: "2026-01-01T00:00:00.000Z",
        },
      ],
      questions: [
        {
          id: "q",
          question: "When does a visitor return the yellow badge?",
          answer: "The visitor returns it to the yard desk before leaving the yard. [Source 1]",
          sources: [
            {
              content: "The visitor returns the yellow badge to the yard desk before leaving the yard.",
              heading: "Visitor badges",
              document_name: "visitor-badge-policy.txt",
              chunk_index: 0,
              similarity: 0.8,
            },
          ],
        },
      ],
    });
    const hit = playbackFor(replay, "When does a visitor return the yellow badge?");
    assert.equal(hit.recorded, true);
    assert.match(hit.text, /yard desk/);
    assert.equal(hit.sources.length, 1);
    const miss = playbackFor(replay, "What is the capital of France?");
    assert.equal(miss.recorded, false);
    assert.match(miss.text, /not in the recorded demo set/);
    assert.equal(RECORDED_LABEL.includes("Gemma 4"), true);
  });
});

describe("sample plan", () => {
  const plan = parseSamplePlan(JSON.parse(readFileSync(path.join(root, "demo/questions.json"), "utf8")));

  it("uses several fictional documents and one question that needs more than one", () => {
    assert.ok(plan.documents.length >= 3 && plan.documents.length <= 5);
    assert.ok(plan.questions.length >= 3 && plan.questions.length <= 4);
    assert.ok(plan.questions.some((question) => question.documents.length > 1));
    const names = new Set(plan.documents.map((document) => document.name));
    for (const question of plan.questions) {
      assert.ok(question.documents.length >= 1);
      for (const name of question.documents) assert.equal(names.has(name), true);
    }
    const documents = readSampleDocuments(root, plan);
    assert.equal(documents.length, plan.documents.length);
    for (const document of documents) {
      assert.match(document.text, /Fictional sample/);
      assert.equal(document.text.includes(FICTIONAL_SAMPLE_NOTE), true);
      assert.equal(/sundial/i.test(document.text), false);
    }
  });
});

describe("record pipeline", () => {
  it("stores the injected answer and attributes passages to their documents", async () => {
    const progress: string[] = [];
    const replay = await buildReplay({
      documents: [
        {
          name: "visitor-badge-policy.txt",
          text: "Visitors return the yellow badge at the yard desk.",
        },
        {
          name: "probe-4-manual.txt",
          text: "The probe shows a steady square before a reading is written down.",
        },
      ],
      questions: ["Which badge rule and probe check apply?"],
      chatModel: "gemma4:31b",
      embedModel: "embeddinggemma",
      baseUrl: "http://127.0.0.1:11434",
      recordedAt: "2026-11-21T00:00:00.000Z",
      async embed(texts) {
        return texts.map((text) => [
          /badge/i.test(text) ? 1 : 0,
          /probe|square/i.test(text) ? 1 : 0,
        ]);
      },
      async answer(question) {
        return `Recorded reply for ${question} [Source 1]`;
      },
      onQuestion(event) {
        progress.push(event.phase);
      },
    });
    assert.deepEqual(progress, ["start", "success"]);
    assert.equal(replay.recorded, true);
    assert.equal(replay.questions[0]?.answer?.includes("Recorded reply"), true);
    assert.equal(replay.chat_model, "gemma4:31b");
    assert.equal(replay.embed_model, "embeddinggemma");
    assert.deepEqual(
      replay.documents.map((document) => document.name),
      ["visitor-badge-policy.txt", "probe-4-manual.txt"]
    );
    const names = new Set(replay.questions[0]?.sources.map((source) => source.document_name));
    assert.equal(names.has("visitor-badge-policy.txt"), true);
    assert.equal(names.has("probe-4-manual.txt"), true);
  });
});

describe("seed plan", () => {
  it("skips the database unless paid seeding is requested", () => {
    const skipped = seedPlan({});
    assert.equal(skipped.action, "skip");
    if (skipped.action === "skip") {
      assert.match(skipped.reason, /Helmfell Yard/);
      assert.equal(/sundial/i.test(skipped.reason), false);
    }
    const paid = seedPlan({ SEED_WITH_OPENAI: "true" });
    assert.equal(paid.action, "openai");
    if (paid.action === "openai") {
      assert.ok(paid.missing.includes("OPENAI_API_KEY"));
    }
  });
});
