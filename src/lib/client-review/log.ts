import "server-only";

// Server-side diagnostics for the Client review upload routes. withTryCatch only
// forwards an Error's message, so a thrown Supabase error OBJECT (PostgrestError is
// a plain object) reaches the browser as the generic fallback. This logs the real
// error — code, message, details — to the server console, then rethrows unchanged.
export async function logClientReviewErrors<T>(
  step: "sign" | "finalize" | "read",
  req: Request,
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run();
  } catch (e) {
    const detail =
      e instanceof Error
        ? { name: e.name, message: e.message, stack: e.stack?.split("\n").slice(0, 4).join("\n") }
        : e;
    // Project ref only (not a secret) — confirms which Supabase DB this server is using.
    const project = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/^https:\/\//, "").split(".")[0];
    console.error(`[client-review/${step}] ${req.method} ${new URL(req.url).pathname} failed (db: ${project}):`, detail);
    throw e;
  }
}
