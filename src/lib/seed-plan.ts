export type SeedPlan =
  | { action: "skip"; reason: string }
  | { action: "openai"; missing: string[] };

/** Demo playback does not need a database row. Paid seeding is explicit. */
export function seedPlan(env: Record<string, string | undefined>): SeedPlan {
  if (env.SEED_WITH_OPENAI !== "true") {
    return {
      action: "skip",
      reason:
        "Demo mode serves samples/pocket-sundial.txt from demo/replay.json and does not use Supabase. Database seed is skipped. Set SEED_WITH_OPENAI=true only if you intend to call the paid embeddings API.",
    };
  }
  const missing: string[] = [];
  if (!env.NEXT_PUBLIC_SUPABASE_URL?.trim()) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!env.SUPABASE_SERVICE_ROLE_KEY?.trim() && !env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()) {
    missing.push("SUPABASE_SERVICE_ROLE_KEY");
  }
  if (!env.OPENAI_API_KEY?.trim()) missing.push("OPENAI_API_KEY");
  return { action: "openai", missing };
}
