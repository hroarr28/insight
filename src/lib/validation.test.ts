import { describe, expect, it } from "vitest";
import {
  LIMITS,
  validateDocumentId,
  validateQuestion,
  validateSearchRequest,
  validateUploadFile,
} from "@/lib/validation";

describe("validateQuestion", () => {
  it("trims a question and defaults history", () => {
    const result = validateQuestion({ question: "  What happened?  " });
    expect(result).toEqual({
      ok: true,
      value: { question: "What happened?", history: [] },
    });
  });

  it("rejects an empty, non-string, or over-long question", () => {
    expect(validateQuestion({ question: "   " }).ok).toBe(false);
    expect(validateQuestion({ question: 12 }).ok).toBe(false);
    expect(validateQuestion({ question: "a".repeat(LIMITS.maxQueryChars + 1) }).ok).toBe(false);
    expect(validateQuestion([]).ok).toBe(false);
  });

  it("rejects a history entry with a bad role or too many messages", () => {
    expect(
      validateQuestion({ question: "Hi", history: [{ role: "system", content: "no" }] }).ok
    ).toBe(false);
    const history = Array.from({ length: LIMITS.maxHistoryMessages + 1 }, () => ({
      role: "user",
      content: "again",
    }));
    expect(validateQuestion({ question: "Hi", history }).ok).toBe(false);
  });

  it("keeps a valid history message", () => {
    const result = validateQuestion({
      question: "Hi",
      history: [{ role: "assistant", content: "Hello" }],
    });
    expect(result.ok && result.value.history).toEqual([
      { role: "assistant", content: "Hello" },
    ]);
  });
});

describe("validateSearchRequest", () => {
  it("defaults the limit and accepts a retrieval mode", () => {
    expect(validateSearchRequest({ query: "taxes" })).toMatchObject({
      ok: true,
      value: { query: "taxes", limit: 5 },
    });
    const result = validateSearchRequest({ query: "taxes", limit: 3, mode: "vector" });
    expect(result.ok && result.value).toEqual({ query: "taxes", limit: 3, mode: "vector" });
  });

  it("rejects a limit outside 1..20 and an unknown mode", () => {
    expect(validateSearchRequest({ query: "taxes", limit: 0 }).ok).toBe(false);
    expect(validateSearchRequest({ query: "taxes", limit: 21 }).ok).toBe(false);
    expect(validateSearchRequest({ query: "taxes", limit: 1.5 }).ok).toBe(false);
    expect(validateSearchRequest({ query: "taxes", mode: "magic" }).ok).toBe(false);
  });
});

describe("validateUploadFile", () => {
  it("accepts a markdown file with an empty browser mime type", () => {
    const result = validateUploadFile({ name: "notes.md", type: "", size: 12 });
    expect(result.ok).toBe(true);
  });

  it("accepts a pdf at the size ceiling and rejects one byte over it", () => {
    expect(
      validateUploadFile({
        name: "paper.pdf",
        type: "application/pdf",
        size: LIMITS.maxFileBytes,
      }).ok
    ).toBe(true);
    expect(
      validateUploadFile({
        name: "paper.pdf",
        type: "application/pdf",
        size: LIMITS.maxFileBytes + 1,
      }).ok
    ).toBe(false);
  });

  it("rejects an extension that is not pdf, txt, or md, even with a text mime type", () => {
    expect(
      validateUploadFile({ name: "run.exe", type: "text/plain", size: 10 }).ok
    ).toBe(false);
  });

  it("rejects a pdf extension paired with a script mime type", () => {
    expect(
      validateUploadFile({
        name: "paper.pdf",
        type: "application/javascript",
        size: 10,
      }).ok
    ).toBe(false);
  });

  it("rejects a missing or empty file", () => {
    expect(validateUploadFile(null).ok).toBe(false);
    expect(validateUploadFile({ name: "a.txt", type: "text/plain", size: 0 }).ok).toBe(false);
  });
});

describe("validateDocumentId", () => {
  it("accepts a uuid and rejects anything else", () => {
    expect(
      validateDocumentId({ id: "3f1a6c2e-8b4d-4e2a-9c11-0a1b2c3d4e5f" }).ok
    ).toBe(true);
    expect(validateDocumentId({ id: "not-a-uuid" }).ok).toBe(false);
    expect(validateDocumentId({}).ok).toBe(false);
  });
});
