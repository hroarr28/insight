export type AppMode = "demo" | "live";
export type LiveProvider = "openai" | "ollama";

export const RECORDED_LABEL =
  "Recorded from local Gemma 4. Live mode runs locally via Ollama.";

/**
 * Demo is always the default, including when OPENAI_API_KEY is set.
 * Live mode starts only when APP_MODE=live. APP_MODE=demo forces replay.
 */
export function resolveAppMode(env: Record<string, string | undefined> = process.env): AppMode {
  return env.APP_MODE?.trim().toLowerCase() === "live" ? "live" : "demo";
}

/**
 * Returned only in live mode when OpenAI was selected and no key is set.
 * Callers must refuse the request. They must not switch back to demo playback.
 */
export function liveConfigurationError(env: Record<string, string | undefined> = process.env): string | null {
  if (resolveAppMode(env) !== "live") return null;
  if (liveProvider(env) === "ollama") return null;
  if (env.OPENAI_API_KEY?.trim()) return null;
  return "APP_MODE=live is set, but OPENAI_API_KEY is missing. Set the key, or set LLM_PROVIDER=ollama. Demo playback was not used for this request.";
}

export function liveProvider(env: Record<string, string | undefined> = process.env): LiveProvider {
  return env.LLM_PROVIDER?.trim().toLowerCase() === "ollama" ? "ollama" : "openai";
}

export function demoMutationMessage(action: "upload" | "delete"): string {
  if (action === "upload") {
    return "Uploads are disabled in the public demo. For live mode set APP_MODE=live and LLM_PROVIDER=ollama.";
  }
  return "Deletion is disabled in the public demo.";
}
