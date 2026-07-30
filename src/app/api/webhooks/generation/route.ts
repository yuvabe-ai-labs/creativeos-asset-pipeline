import { completeGeneration } from "@/lib/generations/complete";
import { apiError, apiOk, isAuthorizedWebhook } from "@/lib/api/route-helpers";

// Kling now polls for completion internally (see the Kling provider rewrite) instead of
// calling back this URL, so this only ever handles the internal Trigger.dev path (Veo,
// Sora) — this app calling itself back. D89: authenticated with the shared secret.
export async function POST(req: Request) {
  if (!isAuthorizedWebhook(req)) return apiError("Unauthorized.", 401);

  const body = await req.json().catch(() => null);
  if (!body) return apiError("Invalid JSON body", 400);

  if (!body?.generationId) return apiError("Missing generationId", 400);
  if (!["succeeded", "failed"].includes(body.status)) {
    return apiError("Invalid status", 400);
  }

  try {
    await completeGeneration(body);
    return apiOk({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Completion failed";
    return apiError(message, 500);
  }
}
