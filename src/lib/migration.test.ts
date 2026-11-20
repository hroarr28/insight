import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrations = path.join(process.cwd(), "supabase/migrations");

describe("hybrid search migration", () => {
  const original = readFileSync(path.join(migrations, "001_initial_schema.sql"), "utf8");
  const hybrid = readFileSync(path.join(migrations, "002_hybrid_full_text.sql"), "utf8");

  it("leaves the vector function in the original migration", () => {
    expect(original).toContain("create or replace function match_documents");
    expect(original).toContain("vector(1536)");
  });

  it("adds a generated tsvector, a gin index, and an OR full-text function", () => {
    expect(hybrid).toContain("content_tsv");
    expect(hybrid).toContain("using gin (content_tsv)");
    expect(hybrid).toContain("search_documents_fts");
    expect(hybrid).toContain("tsq || lex::tsquery");
    expect(hybrid.toLowerCase()).not.toContain("drop table");
    expect(hybrid).not.toContain("function match_documents");
  });
});
