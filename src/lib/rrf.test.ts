import { describe, expect, it } from "vitest";
import { reciprocalRankFusion } from "@/lib/rrf";

describe("reciprocalRankFusion", () => {
  it("fuses two rankings with k = 60", () => {
    const fused = reciprocalRankFusion(
      [
        ["a", "b", "c"],
        ["b", "c", "a"],
      ],
      60
    );

    expect(fused.map((entry) => entry.id)).toEqual(["b", "a", "c"]);
    expect(fused[0].score).toBeCloseTo(1 / 61 + 1 / 62, 12);
    expect(fused[1].score).toBeCloseTo(1 / 61 + 1 / 63, 12);
    expect(fused[2].score).toBeCloseTo(1 / 62 + 1 / 63, 12);
  });

  it("breaks an equal score by id", () => {
    const fused = reciprocalRankFusion(
      [
        ["a", "b"],
        ["b", "a"],
      ],
      60
    );
    expect(fused.map((entry) => entry.id)).toEqual(["a", "b"]);
    expect(fused[0].score).toBeCloseTo(fused[1].score, 12);
  });

  it("counts a repeated id once, at its first rank", () => {
    const fused = reciprocalRankFusion([["a", "a", "b"]], 60);
    expect(fused.map((entry) => entry.id)).toEqual(["a", "b"]);
    expect(fused[0].score).toBeCloseTo(1 / 61, 12);
    expect(fused[1].score).toBeCloseTo(1 / 63, 12);
  });

  it("returns an empty list when every ranking is empty", () => {
    expect(reciprocalRankFusion([[], []])).toEqual([]);
  });

  it("rejects a negative k", () => {
    expect(() => reciprocalRankFusion([["a"]], -1)).toThrow(/k/);
  });
});
