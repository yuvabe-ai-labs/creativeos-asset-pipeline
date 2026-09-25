// D284 — extracted from trigger/video-generate.ts so trigger/video-voice-change.ts can share it.
// The Trigger.dev tasks' callback into this app (D89: shared-secret auth). No `server-only`.
/**
 * Validates the webhook's env config and returns the target. Exported so both tasks' `run()`
 * calls it as its own first line — before the mock wait / before any provider call — the same
 * fail-fast-on-misconfiguration behaviour the pre-D284 video-generate.ts had inline, restored
 * after the D284 extraction dropped it (review fix).
 */
export function assertWebhookConfig(): { url: string; secret: string } {
  const appUrl = process.env.APP_URL;
  if (!appUrl) throw new Error("APP_URL env var not set");
  const secret = process.env.TRIGGER_WEBHOOK_SECRET;
  if (!secret) throw new Error("TRIGGER_WEBHOOK_SECRET env var not set");
  return { url: `${appUrl}/api/webhooks/generation`, secret };
}

export async function postGenerationWebhook(body: object): Promise<Response> {
  const { url, secret } = assertWebhookConfig();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "(unreadable)");
    console.error("Generation webhook call failed", { status: res.status, body: text });
  }
  return res;
}

/**
 * Report a webhook TRANSPORT failure without letting it replace the thing being reported.
 *
 * Node's fetch reports every transport failure as the same opaque `TypeError: fetch failed`
 * with the real reason only on `cause`. Thrown from a catch block, it escaped the task as the
 * run's error — so a generation that failed for a real, nameable reason surfaced as a bare
 * "fetch failed" with the actual cause discarded, and the generation row was never marked failed
 * either. That is how an APP_URL typo (https:// against an http dev server, cause
 * ERR_SSL_WRONG_VERSION_NUMBER) masqueraded as an Omni problem.
 */
export async function postGenerationWebhookSafely(body: object, context: string): Promise<void> {
  try {
    await postGenerationWebhook(body);
  } catch (e) {
    const chain: string[] = [];
    let cur: unknown = e;
    for (let i = 0; i < 4 && cur instanceof Error; i += 1) {
      const code = (cur as { code?: unknown }).code;
      chain.push(typeof code === "string" ? `${cur.message} [${code}]` : cur.message);
      cur = (cur as { cause?: unknown }).cause;
    }
    // assertWebhookConfig() can itself be the thing that failed (e.g. a missing env var) — in
    // that case there's no real URL to report, so fall back rather than letting this throw over
    // the top of the diagnostic we're trying to log.
    let webhookUrl: string;
    try {
      webhookUrl = assertWebhookConfig().url;
    } catch {
      webhookUrl = "(unset — APP_URL or TRIGGER_WEBHOOK_SECRET missing)";
    }
    console.error("Generation webhook unreachable", { context, webhookUrl, reason: chain.join(" ← ") });
  }
}
