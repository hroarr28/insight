export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

/**
 * Sliding window in the memory of this server process.
 * On Vercel each isolate has its own map, so this stops a burst against one
 * instance. The daily model-call cap in Postgres is what bounds spend across
 * instances. No external rate-limit service is required.
 */
export function createRateLimiter(limit: number, windowMs: number) {
  const hits = new Map<string, number[]>();

  return function check(key: string, now: number): RateLimitResult {
    const recent = (hits.get(key) ?? []).filter((stamp) => now - stamp < windowMs);
    if (recent.length >= limit) {
      const retryAfterSeconds = Math.max(1, Math.ceil((recent[0] + windowMs - now) / 1000));
      hits.set(key, recent);
      return { allowed: false, retryAfterSeconds };
    }
    recent.push(now);
    hits.set(key, recent);
    return { allowed: true, retryAfterSeconds: 0 };
  };
}

export const ASK_LIMIT = 8;
export const ASK_WINDOW_MS = 10 * 60 * 1000;
export const SEARCH_LIMIT = 20;
export const SEARCH_WINDOW_MS = 10 * 60 * 1000;
export const UPLOAD_LIMIT = 4;
export const UPLOAD_WINDOW_MS = 60 * 60 * 1000;

export const askLimiter = createRateLimiter(ASK_LIMIT, ASK_WINDOW_MS);
export const searchLimiter = createRateLimiter(SEARCH_LIMIT, SEARCH_WINDOW_MS);
export const uploadLimiter = createRateLimiter(UPLOAD_LIMIT, UPLOAD_WINDOW_MS);

/** Vercel sets x-real-ip to the connecting client. Do not trust a client-supplied list first. */
export function clientAddress(headers: { get(name: string): string | null }): string {
  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) return realIp.slice(0, 64);
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first.slice(0, 64);
  }
  return "unknown";
}

export function contentLengthOver(headers: { get(name: string): string | null }, maxBytes: number): boolean {
  const raw = headers.get("content-length");
  if (!raw) return false;
  const size = Number(raw);
  return Number.isFinite(size) && size > maxBytes;
}
