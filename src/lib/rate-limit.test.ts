import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { clientAddress, contentLengthOver, createRateLimiter } from "./rate-limit.ts";

describe("rate limiter", () => {
  it("allows traffic inside the window and rejects the next call", () => {
    const check = createRateLimiter(2, 10_000);
    assert.equal(check("1.2.3.4", 0).allowed, true);
    assert.equal(check("1.2.3.4", 1000).allowed, true);
    const blocked = check("1.2.3.4", 2000);
    assert.equal(blocked.allowed, false);
    assert.ok(blocked.retryAfterSeconds >= 1);
  });

  it("allows the same key again after the window and keeps other keys separate", () => {
    const check = createRateLimiter(1, 1000);
    assert.equal(check("a", 0).allowed, true);
    assert.equal(check("a", 500).allowed, false);
    assert.equal(check("b", 500).allowed, true);
    assert.equal(check("a", 1000).allowed, true);
  });
});

describe("request metadata", () => {
  it("prefers x-real-ip and falls back to the first forwarded address", () => {
    assert.equal(clientAddress(new Headers({ "x-real-ip": "203.0.113.5" })), "203.0.113.5");
    assert.equal(
      clientAddress(new Headers({ "x-forwarded-for": "198.51.100.8, 10.0.0.1" })),
      "198.51.100.8"
    );
    assert.equal(clientAddress(new Headers()), "unknown");
  });

  it("flags a content-length above the cap", () => {
    assert.equal(contentLengthOver(new Headers({ "content-length": "11" }), 10), true);
    assert.equal(contentLengthOver(new Headers({ "content-length": "10" }), 10), false);
    assert.equal(contentLengthOver(new Headers(), 10), false);
  });
});
