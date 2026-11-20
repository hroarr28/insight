/** Pull the first JSON object out of a model response, including fenced blocks. */
export function parseJsonObject(raw: string): unknown {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : trimmed).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("Model output did not contain a JSON object");
  }
  return JSON.parse(candidate.slice(start, end + 1));
}
