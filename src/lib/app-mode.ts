export type AppMode = "demo" | "live";
export type LiveProvider = "openai" | "ollama";

export const RECORDED_LABEL =
  "Recorded from local Gemma 4. Live mode runs locally via Ollama.";

/**
 * Public demo is the default. A paid provider is used only when a key is set,
 * and Ollama is used only when LLM_PROVIDER=ollama. APP_MODE=demo forces replay
 * even if a key is still present.
 */
export function resolveAppMode(env: Record<string, string | undefined> = process.env): AppMode {
  const forced = env.APP_MODE?.trim().toLowerCase();
  if (forced === "demo") return "demo";
  if (forced === "live") return "live";
  if (env.LLM_PROVIDER?.trim().toLowerCase() === "ollama") return "live";
  if (env.OPENAI_API_KEY?.trim()) return "live";
  return "demo";
}

export function liveProvider(env: Record<string, string | undefined> = process.env): LiveProvider {
  return env.LLM_PROVIDER?.trim().toLowerCase() === "ollama" ? "ollama" : "openai";
}

export function demoMutationMessage(action: "upload" | "delete"): string {
  if (action === "upload") {
    return "Uploads are disabled in the public demo. Run the app locally with LLM_PROVIDER=ollama to index your own files.";
  }
  return "Deletion is disabled in the public demo.";
}
