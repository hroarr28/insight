import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decideAdminAccess } from "./admin-auth.ts";

const SECRET = "correct-horse-battery";

describe("admin access", () => {
  it("disables deletion when the secret is missing or too short", () => {
    assert.equal(decideAdminAccess("Bearer " + SECRET, {}), "disabled");
    assert.equal(decideAdminAccess("Bearer " + SECRET, { ADMIN_SECRET: "short" }), "disabled");
  });

  it("rejects a missing or wrong bearer token", () => {
    const env = { ADMIN_SECRET: SECRET };
    assert.equal(decideAdminAccess(null, env), "unauthorized");
    assert.equal(decideAdminAccess("Bearer wrong-horse-battery", env), "unauthorized");
    assert.equal(decideAdminAccess(SECRET, env), "unauthorized");
  });

  it("accepts the matching bearer token and does not echo it", () => {
    const decision = decideAdminAccess("Bearer " + SECRET, { ADMIN_SECRET: SECRET });
    assert.equal(decision, "ok");
    assert.equal(JSON.stringify(decision).includes(SECRET), false);
  });
});
