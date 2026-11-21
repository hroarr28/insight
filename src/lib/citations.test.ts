import { describe, expect, it } from "vitest";
import { parseCitations } from "@/lib/citations";

describe("parseCitations", () => {
  it("returns unique source numbers in first-seen order", () => {
    expect(parseCitations("See [Source 2] and then [Source 1].")).toEqual([2, 1]);
    expect(parseCitations("[Source 1] again [source 1] and [SOURCE 3]")).toEqual([1, 3]);
  });

  it("ignores unbracketed mentions and numbers below 1", () => {
    expect(parseCitations("Source 1 is not a citation. [Source 0] [Source -1]")).toEqual([]);
  });

  it("reads a multi-digit source", () => {
    expect(parseCitations("Backed by [Source 12].")).toEqual([12]);
  });
});
