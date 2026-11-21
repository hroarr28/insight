const REQUIRED_STORAGE = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const;

export function missingStorageEnv(env: Record<string, string | undefined>): string[] {
  return REQUIRED_STORAGE.filter((name) => !env[name]?.trim());
}

export function missingModelEnv(env: Record<string, string | undefined>): string[] {
  return env.OPENAI_API_KEY?.trim() ? [] : ["OPENAI_API_KEY"];
}

export function storageConfigMessage(missing: string[]): string {
  return `Document storage is not configured. Set ${missing.join(" and ")} on the server.`;
}

export const STORAGE_UNAVAILABLE =
  "Document storage is unavailable. Confirm the Supabase project is running and that supabase/migrations/001_initial_schema.sql has been applied.";

export const MODEL_UNAVAILABLE = "The model provider is not configured. Set OPENAI_API_KEY on the server.";

export const SPEND_UNAVAILABLE =
  "The demo spend cap could not be checked, so this request was refused.";

/** Log a short message. Never log headers, env values, or a stack. */
export function safeLog(label: string, error: unknown): void {
  const message = error instanceof Error ? error.message : "unknown error";
  const redacted = message.replace(/eyJ[A-Za-z0-9_-]{8,}/g, "[redacted]").slice(0, 180);
  console.error(`${label}: ${redacted}`);
}
