import { supabaseAdmin } from "./supabase";
import type { SpendResult } from "./spend-cap";

export async function consumeDemoCall(limit: number): Promise<SpendResult> {
  const { data, error } = await supabaseAdmin.rpc("consume_demo_call", { max_calls: limit });
  if (error) return "unavailable";
  return data === true ? "ok" : "capped";
}
