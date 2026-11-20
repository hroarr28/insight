import { describe, expect, it } from "vitest";
import { Bm25Index, MAX_QUERY_LEXEMES, queryLexemes } from "@/lib/eval/lexical";

describe("queryLexemes", () => {
  it("keeps the alphabetically first 40 distinct lexemes, matching the SQL cap", () => {
    const tokens = Array.from({ length: 41 }, (_, index) => `q${String(index).padStart(2, "0")}`);
    const lexemes = queryLexemes(tokens.join(" "));
    expect(MAX_QUERY_LEXEMES).toBe(40);
    expect(lexemes).toHaveLength(40);
    expect(lexemes[0]).toBe("q00");
    expect(lexemes).not.toContain("q40");
  });

  it("does not rank a document that only contains the dropped lexeme", () => {
    const tokens = Array.from({ length: 41 }, (_, index) => `q${String(index).padStart(2, "0")}`);
    const index = new Bm25Index([
      { id: "dropped", text: "q40" },
      { id: "kept", text: "q00" },
    ]);
    const hits = index.search(tokens.join(" "), 5);
    expect(hits.map((hit) => hit.id)).toEqual(["kept"]);
  });
});
