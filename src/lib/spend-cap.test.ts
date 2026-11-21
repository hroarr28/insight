import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dailyModelCallLimit, demoModeEnabled, enforceDemoSpend } from "./spend-cap.ts";

describe("demo spend cap", () => {
  it("is on for explicit demo mode and for Vercel production, and off when refused", () => {
    assert.equal(demoModeEnabled({ DEMO_MODE: "true" }), true);
    assert.equal(demoModeEnabled({ VERCEL_ENV: "production" }), true);
    assert.equal(demoModeEnabled({ VERCEL_ENV: "production", DEMO_MODE: "false" }), false);
    assert.equal(demoModeEnabled({}), false);
  });

  it("uses 40 calls when the override is missing or invalid", () => {
    assert.equal(dailyModelCallLimit({}), 40);
    assert.equal(dailyModelCallLimit({ DEMO_DAILY_MODEL_CALLS: "12" }), 12);
    assert.equal(dailyModelCallLimit({ DEMO_DAILY_MODEL_CALLS: "0" }), 40);
  });

  it("does not consult the store when the cap is off", async () => {
    let called = false;
    const decision = await enforceDemoSpend({}, async () => {
      called = true;
      return "capped";
    });
    assert.equal(called, false);
    assert.equal(decision.ok, true);
  });

  it("returns 429 when the cap is reached and 503 when the store cannot be checked", async () => {
    const capped = await enforceDemoSpend({ DEMO_MODE: "true" }, async () => "capped");
    assert.equal(capped.ok, false);
    assert.equal(capped.status, 429);
    assert.equal(capped.error?.includes("sk-"), false);

    const down = await enforceDemoSpend({ DEMO_MODE: "true" }, async () => {
      throw new Error("database unavailable");
    });
    assert.equal(down.status, 503);
    assert.match(down.error ?? "", /refused/);
  });
});
