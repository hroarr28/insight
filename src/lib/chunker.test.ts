import { describe, expect, it } from "vitest";
import {
  chunkHeadingAware,
  chunkText,
  chunkWithStrategy,
} from "@/lib/chunker";

describe("chunkText", () => {
  it("returns nothing for blank input", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText(" \n\n \n")).toEqual([]);
  });

  it("splits on a paragraph boundary and keeps a word overlap", () => {
    const chunks = chunkText("AAAA BBBB CCCC DDDD EEEE\n\nFFFF GGGG HHHH", {
      chunkSize: 30,
      overlap: 2,
    });

    expect(chunks.map((chunk) => chunk.content)).toEqual([
      "AAAA BBBB CCCC DDDD EEEE",
      "DDDD EEEE\n\nFFFF GGGG HHHH",
    ]);
    expect(chunks.map((chunk) => chunk.index)).toEqual([0, 1]);
  });

  it("records a markdown heading without removing it from the text", () => {
    const chunks = chunkText("# Title\n\nBody text here.");
    expect(chunks).toHaveLength(1);
    expect(chunks[0].metadata.heading).toBe("Title");
    expect(chunks[0].content).toContain("# Title");
    expect(chunks[0].content).toContain("Body text here.");
  });

  it("records a short all-caps line as a heading", () => {
    const chunks = chunkText("INTRODUCTION\n\nSome body text.");
    expect(chunks[0].metadata.heading).toBe("INTRODUCTION");
  });

  it("keeps a single oversized paragraph intact", () => {
    const paragraph = "word ".repeat(80).trim();
    const chunks = chunkText(paragraph, { chunkSize: 20, overlap: 2 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toBe(paragraph);
  });
});

describe("chunking strategies", () => {
  const text = Array.from(
    { length: 20 },
    (_, index) => `Paragraph number ${index} with enough words to take space in the window.`
  ).join("\n\n");

  it("uses a larger window for paragraph-1000-100 than the baseline", () => {
    const baseline = chunkWithStrategy(text, "paragraph-500-50");
    const wider = chunkWithStrategy(text, "paragraph-1000-100");
    expect(baseline.length).toBeGreaterThan(1);
    expect(wider.length).toBeLessThan(baseline.length);
  });

  it("does not let a later section leak into the previous heading", () => {
    const chunks = chunkHeadingAware("# One\n\nalpha stays here.\n\n## Two\n\nbeta stays here.", {
      chunkSize: 500,
      overlap: 10,
    });
    expect(chunks.map((chunk) => chunk.metadata.heading)).toEqual(["One", "Two"]);
    expect(chunks[0].content).toContain("alpha stays here.");
    expect(chunks[0].content).not.toContain("beta stays here.");
    expect(chunks[1].content).toContain("beta stays here.");
    expect(chunks[1].content).toContain("Two");
  });
});
