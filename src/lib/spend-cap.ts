export type SpendResult = "ok" | "capped" | "unavailable";

export interface SpendDecision {
  ok: boolean;
  status?: 429 | 503;
  error?: string;
  retryAfterSeconds?: number;
}

/**
 * Production on Vercel is capped unless DEMO_MODE is explicitly false.
 * Local development is uncapped unless DEMO_MODE is explicitly true.
 */
export function demoModeEnabled(env: Record<string, string | undefined>): boolean {
  if (env.DEMO_MODE === "true") return true;
  if (env.DEMO_MODE === "false") return false;
  return env.VERCEL_ENV === "production";
}

export function dailyModelCallLimit(env: Record<string, string | undefined>): number {
  const raw = env.DEMO_DAILY_MODEL_CALLS;
  if (!raw) return 40;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 10000) return 40;
  return parsed;
}

export async function enforceDemoSpend(
  env: Record<string, string | undefined>,
  consume: (limit: number) => Promise<SpendResult>
): Promise<SpendDecision> {
  if (!demoModeEnabled(env)) return { ok: true };
  let result: SpendResult;
  try {
    result = await consume(dailyModelCallLimit(env));
  } catch {
    result = "unavailable";
  }
  if (result === "ok") return { ok: true };
  if (result === "capped") {
    return {
      ok: false,
      status: 429,
      error: "The daily demo limit for model calls has been reached. Try again tomorrow.",
      retryAfterSeconds: 3600,
    };
  }
  return {
    ok: false,
    status: 503,
    error: "The demo spend cap could not be checked, so this request was refused.",
  };
}
