import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { judgeHeuristically, parseFaithfulnessJudgement } from "@/lib/eval/judge";
import type { JudgeControl } from "@/lib/eval/types";

const controls = JSON.parse(
  readFileSync(path.join(process.cwd(), "eval/judge-controls.json"), "utf8")
) as JudgeControl[];

describe("judgeHeuristically", () => {
  it("matches every labelled control except the documented glued-clause miss", () => {
    const glued = controls.find((control) => control.id === "control-glued-clause");
    expect(glued).toBeDefined();
    expect(judgeHeuristically(glued!).faithful).toBe(true);
    expect(glued!.expect_faithful).toBe(false);

    for (const control of controls) {
      if (control.id === "control-glued-clause") continue;
      expect(judgeHeuristically(control).faithful).toBe(control.expect_faithful);
    }
  });

  it("treats the second abstention sentence as faithful", () => {
    expect(
      judgeHeuristically({
        question: "Where is it?",
        answer: "The documents do not contain enough information to answer.",
        sources: [],
      }).faithful
    ).toBe(true);
  });
});

describe("parseFaithfulnessJudgement", () => {
  it("reads a fenced verdict and rejects a verdict without a boolean", () => {
    const raw = '```json\n{"faithful": false, "unsupported_claims": ["a railway"]}\n```';
    expect(parseFaithfulnessJudgement(raw)).toEqual({
      faithful: false,
      unsupported_claims: ["a railway"],
    });
    expect(parseFaithfulnessJudgement('{"unsupported_claims":[]}')).toBeNull();
  });
});
