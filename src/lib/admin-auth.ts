import { createHash, timingSafeEqual } from "node:crypto";

const MIN_SECRET_LENGTH = 16;

export type AdminDecision = "ok" | "disabled" | "unauthorized";

export function adminSecret(env: Record<string, string | undefined> = process.env): string {
  return env.ADMIN_SECRET ?? "";
}

/** Hash both sides so the compare is constant-time and independent of length. */
export function secretsMatch(expected: string, presented: string): boolean {
  const left = createHash("sha256").update(expected).digest();
  const right = createHash("sha256").update(presented).digest();
  return timingSafeEqual(left, right);
}

export function bearerToken(authorization: string | null): string {
  if (!authorization) return "";
  const match = /^Bearer\s+(\S+)\s*$/i.exec(authorization);
  return match ? match[1] : "";
}

export function decideAdminAccess(
  authorization: string | null,
  env: Record<string, string | undefined> = process.env
): AdminDecision {
  const secret = adminSecret(env);
  if (secret.length < MIN_SECRET_LENGTH) return "disabled";
  const presented = bearerToken(authorization);
  if (!presented || !secretsMatch(secret, presented)) return "unauthorized";
  return "ok";
}
