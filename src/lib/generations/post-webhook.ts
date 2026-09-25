// D284 — extracted from trigger/video-generate.ts so trigger/video-voice-change.ts can share it.
// The Trigger.dev tasks' callback into this app (D89: shared-secret auth). No `server-only`.
function target() {
  const appUrl = process.env.APP_URL;
  if (!appUrl) throw new Error("APP_URL env var not set");
  const secret = process.env.TRIGGER_WEBHOOK_SECRET;
  if (!secret) throw new Error("TRIGGER_WEBHOOK_SECRET env var not set");
  return { url: `${appUrl}/api/webhooks/generation`, secret };
}

export async function postGenerationWebhook(body: object): Promise<Response> {
  const { url, secret } = target();
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
    console.error("Generation webhook unreachable", { context, reason: chain.join(" ← ") });
  }
}
