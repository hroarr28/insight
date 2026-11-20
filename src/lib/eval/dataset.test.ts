import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { EvalQuestion } from "@/lib/eval/types";

const root = process.cwd();
const corpusDir = path.join(root, "eval/corpus");

describe("eval dataset", () => {
  const documents = new Map(
    readdirSync(corpusDir)
      .filter((name) => name.endsWith(".txt"))
      .map((name) => [name, readFileSync(path.join(corpusDir, name), "utf8")])
  );
  const questions = (
    JSON.parse(readFileSync(path.join(root, "eval/questions.json"), "utf8")) as {
      questions: EvalQuestion[];
    }
  ).questions;

  it("has a public-domain source note and 30 to 60 questions", () => {
    const sources = readFileSync(path.join(corpusDir, "SOURCES.md"), "utf8");
    expect(sources.toLowerCase()).toContain("public domain");
    expect(sources).toContain("Project Gutenberg");
    expect(questions.length).toBeGreaterThanOrEqual(30);
    expect(questions.length).toBeLessThanOrEqual(60);
    expect(documents.size).toBeGreaterThanOrEqual(4);
  });

  it("points every gold quote at one unique passage in the named file", () => {
    const corpus = [...documents.values()].join("\n");
    for (const question of questions) {
      const text = documents.get(question.document);
      expect(text, question.id).toBeDefined();
      expect(question.gold_quotes.length).toBeGreaterThan(0);
      for (const quote of question.gold_quotes) {
        expect(text!.split(quote).length - 1, question.id).toBe(1);
        expect(corpus.split(quote).length - 1, question.id).toBe(1);
      }
    }
  });
});
