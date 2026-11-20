import { describe, expect, it } from "vitest";
import { citationAccuracy, mean, recallAtK, reciprocalRank } from "@/lib/eval/metrics";

const relevant = new Set(["a", "c"]);

describe("recallAtK", () => {
  const retrieved = ["b", "a", "c"];

  it("matches a hand-counted ranking", () => {
    expect(recallAtK(retrieved, relevant, 1)).toBe(0);
    expect(recallAtK(retrieved, relevant, 2)).toBe(0.5);
    expect(recallAtK(retrieved, relevant, 3)).toBe(1);
  });

  it("does not double-count a repeated relevant id", () => {
    expect(recallAtK(["a", "a"], relevant, 2)).toBe(0.5);
  });

  it("is zero when there is nothing relevant to find", () => {
    expect(recallAtK(["a"], new Set(), 1)).toBe(0);
  });

  it("rejects a non-positive k", () => {
    expect(() => recallAtK(["a"], relevant, 0)).toThrow(/k/);
  });
});

describe("reciprocalRank", () => {
  it("is the reciprocal of the first relevant rank", () => {
    expect(reciprocalRank(["b", "a", "c"], relevant)).toBe(0.5);
    expect(reciprocalRank(["b", "d"], relevant)).toBe(0);
  });
});

describe("citationAccuracy", () => {
  const shown = ["a", "b", "c"];

  it("scores only the citations that land on a relevant shown chunk", () => {
    expect(citationAccuracy([1, 3], shown, relevant)).toBe(1);
    expect(citationAccuracy([1, 2], shown, new Set(["a"]))).toBe(0.5);
    expect(citationAccuracy([4], shown, relevant)).toBe(0);
    expect(citationAccuracy([], shown, relevant)).toBe(0);
  });
});

describe("mean", () => {
  it("averages numbers and returns 0 for an empty list", () => {
    expect(mean([1, 2, 3])).toBe(2);
    expect(mean([])).toBe(0);
  });
});
