import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { RECORDED_LABEL } from "./app-mode.ts";
import { liveProvider, resolveAppMode } from "./app-mode.ts";
import { buildReplay } from "./record-demo.ts";
import { loadReplay, playbackFor } from "./replay.ts";
import { seedPlan } from "./seed-plan.ts";

describe("app mode", () => {
  it("defaults to demo when no provider is configured", () => {
    assert.equal(resolveAppMode({}), "demo");
    assert.equal(resolveAppMode({ OPENAI_API_KEY: "present" }), "live");
    assert.equal(resolveAppMode({ LLM_PROVIDER: "ollama" }), "live");
    assert.equal(resolveAppMode({ OPENAI_API_KEY: "present", APP_MODE: "demo" }), "demo");
    assert.equal(liveProvider({ LLM_PROVIDER: "ollama" }), "ollama");
    assert.equal(liveProvider({}), "openai");
  });
});

describe("committed replay fixture", () => {
  const raw = JSON.parse(readFileSync(new URL("../../demo/replay.json", import.meta.url), "utf8"));

  it("is a placeholder and does not contain recorded answers", () => {
    const replay = loadReplay(raw);
    assert.equal(replay.recorded, false);
    assert.match(replay.note, /not model outputs/i);
    for (const question of replay.questions) {
      assert.equal(question.answer, null);
      assert.deepEqual(question.sources, []);
    }
  });

  it("does not play back answer text while recorded is false", () => {
    const replay = loadReplay({
      ...raw,
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
          id: "sample-pocket-sundial",
          name: "pocket-sundial.txt",
          file_type: "text/plain",
          chunk_count: 1,
          created_at: "2026-01-01T00:00:00.000Z",
        },
      ],
      questions: [
        {
          id: "q",
          question: "What does a pocket sundial measure?",
          answer: "It measures the sun's direction. [Source 1]",
          sources: [
            {
              content: "the sundial measures the sun's direction",
              heading: null,
              document_name: "pocket-sundial.txt",
              chunk_index: 0,
              similarity: 0.8,
            },
          ],
        },
      ],
    });
    const hit = playbackFor(replay, "What does a pocket sundial measure?");
    assert.equal(hit.recorded, true);
    assert.match(hit.text, /sun's direction/);
    assert.equal(hit.sources.length, 1);
    const miss = playbackFor(replay, "What is the capital of France?");
    assert.equal(miss.recorded, false);
    assert.match(miss.text, /not in the recorded demo set/);
    assert.equal(RECORDED_LABEL.includes("Gemma 4"), true);
  });
});

describe("record pipeline", () => {
  it("stores the answer returned by the injected model and does not call the network", async () => {
    const replay = await buildReplay({
      documentName: "pocket-sundial.txt",
      documentText: "A pocket sundial measures the sun's direction with a gnomon.",
      questions: ["What does a pocket sundial measure?"],
      chatModel: "gemma4:31b",
      embedModel: "embeddinggemma",
      baseUrl: "http://127.0.0.1:11434",
      recordedAt: "2026-11-21T00:00:00.000Z",
      async embed(texts) {
        return texts.map((text) => [text.includes("gnomon") || text.includes("measure") ? 1 : 0, 0]);
      },
      async answer(question) {
        return `Recorded reply for ${question} [Source 1]`;
      },
    });
    assert.equal(replay.recorded, true);
    assert.equal(replay.questions[0]?.answer?.includes("Recorded reply"), true);
    assert.equal(replay.chat_model, "gemma4:31b");
    assert.equal(replay.embed_model, "embeddinggemma");
  });
});

describe("seed plan", () => {
  it("skips the database unless paid seeding is requested", () => {
    const skipped = seedPlan({});
    assert.equal(skipped.action, "skip");
    const paid = seedPlan({ SEED_WITH_OPENAI: "true" });
    assert.equal(paid.action, "openai");
    if (paid.action === "openai") {
      assert.ok(paid.missing.includes("OPENAI_API_KEY"));
    }
  });
});
