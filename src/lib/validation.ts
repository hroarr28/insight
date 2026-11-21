import type { RetrievalMode } from "@/lib/types";

export const LIMITS = {
  maxQueryChars: 2000,
  maxHistoryMessages: 10,
  maxHistoryChars: 8000,
  maxFileBytes: 10 * 1024 * 1024,
  maxMatchCount: 20,
} as const;

const ALLOWED_EXTENSIONS = [".pdf", ".txt", ".md", ".markdown"];
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/x-markdown",
]);

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface HistoryMessage {
  role: "user" | "assistant";
  content: string;
}

export interface UploadFile {
  name: string;
  type: string;
  size: number;
}

type Ok<T> = { ok: true; value: T };
type Err = { ok: false; error: string; status: 400 };
export type Validation<T> = Ok<T> | Err;

function fail(error: string): Err {
  return { ok: false, error, status: 400 };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateQueryText(value: unknown, label: string): Validation<string> {
  if (typeof value !== "string") {
    return fail(`${label} is required.`);
  }
  const query = value.trim();
  if (!query) {
    return fail(`${label} is required.`);
  }
  if (query.length > LIMITS.maxQueryChars) {
    return fail(`${label} must be ${LIMITS.maxQueryChars} characters or fewer.`);
  }
  return { ok: true, value: query };
}

export function validateHistory(value: unknown): Validation<HistoryMessage[]> {
  if (value === undefined) return { ok: true, value: [] };
  if (!Array.isArray(value)) return fail("History must be a list of messages.");
  if (value.length > LIMITS.maxHistoryMessages) {
    return fail(`History is limited to ${LIMITS.maxHistoryMessages} messages.`);
  }

  const history: HistoryMessage[] = [];
  for (const item of value) {
    if (!isRecord(item)) return fail("History messages must be objects.");
    if (item.role !== "user" && item.role !== "assistant") {
      return fail("History roles must be user or assistant.");
    }
    if (typeof item.content !== "string") {
      return fail("History message content must be a string.");
    }
    if (item.content.length > LIMITS.maxHistoryChars) {
      return fail("A history message is too long.");
    }
    history.push({ role: item.role, content: item.content });
  }

  return { ok: true, value: history };
}

export function validateQuestion(
  body: unknown
): Validation<{ question: string; history: HistoryMessage[] }> {
  if (!isRecord(body)) return fail("Request body must be an object.");
  const question = validateQueryText(body.question, "Question");
  if (!question.ok) return question;
  const history = validateHistory(body.history);
  if (!history.ok) return history;
  return { ok: true, value: { question: question.value, history: history.value } };
}

const RETRIEVAL_MODES = new Set<RetrievalMode>([
  "vector",
  "hybrid",
  "hybrid-rerank",
]);

export function validateSearchRequest(
  body: unknown
): Validation<{ query: string; limit: number; mode?: RetrievalMode }> {
  if (!isRecord(body)) return fail("Request body must be an object.");
  const query = validateQueryText(body.query, "Query");
  if (!query.ok) return query;

  let limit = 5;
  if (body.limit !== undefined) {
    if (
      typeof body.limit !== "number" ||
      !Number.isInteger(body.limit) ||
      body.limit < 1 ||
      body.limit > LIMITS.maxMatchCount
    ) {
      return fail(`Limit must be an integer from 1 to ${LIMITS.maxMatchCount}.`);
    }
    limit = body.limit;
  }

  if (body.mode !== undefined) {
    if (typeof body.mode !== "string" || !RETRIEVAL_MODES.has(body.mode as RetrievalMode)) {
      return fail("Mode must be vector, hybrid, or hybrid-rerank.");
    }
    return {
      ok: true,
      value: { query: query.value, limit, mode: body.mode as RetrievalMode },
    };
  }

  return { ok: true, value: { query: query.value, limit } };
}

export function fileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  if (dot < 0) return "";
  return name.slice(dot).toLowerCase();
}

export function validateUploadFile(file: UploadFile | null): Validation<UploadFile> {
  if (!file) return fail("No file provided.");
  if (!Number.isFinite(file.size) || file.size <= 0) {
    return fail("The file is empty.");
  }
  if (file.size > LIMITS.maxFileBytes) {
    return fail("File too large. Maximum 10MB.");
  }

  const extension = fileExtension(file.name);
  if (!ALLOWED_EXTENSIONS.includes(extension)) {
    return fail("Unsupported file type. Upload PDF, TXT, or MD files.");
  }

  const mime = file.type.trim().toLowerCase();
  if (mime && mime !== "application/octet-stream" && !ALLOWED_MIME_TYPES.has(mime)) {
    return fail("Unsupported file type. Upload PDF, TXT, or MD files.");
  }

  return { ok: true, value: file };
}

export function validateDocumentId(value: unknown): Validation<string> {
  if (!isRecord(value)) return fail("Request body must be an object.");
  if (typeof value.id !== "string" || !UUID.test(value.id)) {
    return fail("A valid document id is required.");
  }
  return { ok: true, value: value.id };
}
