export function jsonError(
  error: string,
  status: number,
  headers?: Record<string, string>
): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      ...headers,
    },
  });
}

export function rateLimited(retryAfterSeconds: number): Response {
  return jsonError("Too many requests. Try again later.", 429, {
    "retry-after": String(retryAfterSeconds),
  });
}

export function adminDenied(decision: "disabled" | "unauthorized"): Response {
  if (decision === "disabled") {
    return jsonError("Document deletion is disabled.", 403);
  }
  return jsonError("Admin authentication is required.", 401);
}
