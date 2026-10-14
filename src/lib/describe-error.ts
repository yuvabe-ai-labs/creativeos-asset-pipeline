/**
 * Any thrown value as one readable line for a server log. Supabase and many SDKs throw plain
 * objects ({ message, code, details }), which `String(e)` turns into "[object Object]".
 * For logs only: what people see comes from each feature's own plain copy.
 */
export function describeError(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object") {
    const o = e as { message?: unknown; code?: unknown; details?: unknown; hint?: unknown };
    const parts = [o.code, o.message, o.details, o.hint].filter((p) => typeof p === "string" && p);
    if (parts.length) return parts.join(" | ");
    try {
      return JSON.stringify(e);
    } catch {
      return Object.prototype.toString.call(e);
    }
  }
  return String(e);
}
