import { decideAdminAccess, type AdminDecision } from "./admin-auth";
import { missingModelEnv, missingStorageEnv, MODEL_UNAVAILABLE, storageConfigMessage } from "./config-status";
import { jsonError, rateLimited } from "./http";
import {
  askLimiter,
  clientAddress,
  contentLengthOver,
  searchLimiter,
  uploadLimiter,
  type RateLimitResult,
} from "./rate-limit";

export const MAX_QUESTION_CHARS = 2000;
export const MAX_HISTORY_MESSAGES = 8;
export const MAX_HISTORY_CHARS = 4000;
export const MAX_JSON_BYTES = 64 * 1024;
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Check = (key: string, now: number) => RateLimitResult;

export function guardBodySize(request: Request, maxBytes: number): Response | null {
  if (!contentLengthOver(request.headers, maxBytes)) return null;
  return jsonError("Request body is too large.", 413);
}

export function guardRate(
  request: Request,
  check: Check,
  now = Date.now()
): Response | null {
  const result = check(clientAddress(request.headers), now);
  if (result.allowed) return null;
  return rateLimited(result.retryAfterSeconds);
}

export function guardAskRate(request: Request, now = Date.now()): Response | null {
  return guardRate(request, askLimiter, now);
}

export function guardSearchRate(request: Request, now = Date.now()): Response | null {
  return guardRate(request, searchLimiter, now);
}

export function guardUploadRate(request: Request, now = Date.now()): Response | null {
  return guardRate(request, uploadLimiter, now);
}

export function guardModelConfig(env: Record<string, string | undefined> = process.env): Response | null {
  const missing = missingModelEnv(env);
  if (missing.length === 0) return null;
  return jsonError(MODEL_UNAVAILABLE, 503);
}

export function guardStorageConfig(env: Record<string, string | undefined> = process.env): Response | null {
  const missing = missingStorageEnv(env);
  if (missing.length === 0) return null;
  return jsonError(storageConfigMessage(missing), 503);
}

export function guardAdmin(request: Request, env: Record<string, string | undefined> = process.env): Response | null {
  const decision: AdminDecision = decideAdminAccess(request.headers.get("authorization"), env);
  if (decision === "ok") return null;
  if (decision === "disabled") return jsonError("Document deletion is disabled.", 403);
  return jsonError("Admin authentication is required.", 401);
}

export function validateQuestionInput(body: unknown): { ok: true; question: string; history: { role: "user" | "assistant"; content: string }[] } | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Request body must be an object." };
  }
  const record = body as { question?: unknown; history?: unknown };
  if (typeof record.question !== "string" || !record.question.trim()) {
    return { ok: false, error: "Question is required." };
  }
  const question = record.question.trim();
  if (question.length > MAX_QUESTION_CHARS) {
    return { ok: false, error: `Question must be ${MAX_QUESTION_CHARS} characters or fewer.` };
  }
  if (record.history === undefined) return { ok: true, question, history: [] };
  if (!Array.isArray(record.history) || record.history.length > MAX_HISTORY_MESSAGES) {
    return { ok: false, error: `History is limited to ${MAX_HISTORY_MESSAGES} messages.` };
  }
  const history: { role: "user" | "assistant"; content: string }[] = [];
  for (const item of record.history) {
    if (!item || typeof item !== "object") return { ok: false, error: "History messages must be objects." };
    const message = item as { role?: unknown; content?: unknown };
    if (message.role !== "user" && message.role !== "assistant") {
      return { ok: false, error: "History roles must be user or assistant." };
    }
    if (typeof message.content !== "string" || message.content.length > MAX_HISTORY_CHARS) {
      return { ok: false, error: "A history message is too long." };
    }
    history.push({ role: message.role, content: message.content });
  }
  return { ok: true, question, history };
}

export function validateSearchInput(body: unknown): { ok: true; query: string; limit: number } | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Request body must be an object." };
  }
  const record = body as { query?: unknown; limit?: unknown };
  if (typeof record.query !== "string" || !record.query.trim()) {
    return { ok: false, error: "Query is required." };
  }
  const query = record.query.trim();
  if (query.length > MAX_QUESTION_CHARS) {
    return { ok: false, error: `Query must be ${MAX_QUESTION_CHARS} characters or fewer.` };
  }
  let limit = 5;
  if (record.limit !== undefined) {
    if (typeof record.limit !== "number" || !Number.isInteger(record.limit) || record.limit < 1 || record.limit > 8) {
      return { ok: false, error: "Limit must be an integer from 1 to 8." };
    }
    limit = record.limit;
  }
  return { ok: true, query, limit };
}

export function validateDocumentId(value: unknown): string | null {
  if (typeof value !== "string" || !UUID.test(value)) return null;
  return value;
}
