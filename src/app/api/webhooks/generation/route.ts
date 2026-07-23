import { completeGeneration } from "@/lib/generations/complete";
import { getGenerationByProviderJobId } from "@/lib/db/generations";
import { mapKlingWebhookPayload } from "./kling-mapper";
import { apiError, apiOk, isAuthorizedWebhook } from "@/lib/api/route-helpers";

export async function POST(req: Request) {
  const url = new URL(req.url);
  const provider = url.searchParams.get("provider");

  const body = await req.json().catch(() => null);
  if (!body) return apiError("Invalid JSON body", 400);

  // Kling webhook branch — Kling calls back a URL it was given at job-submission time,
  // an external provider not guaranteed to forward custom headers, so the secret
  // travels in the URL instead of an Authorization header.
  if (provider === "kling") {
    const secret = process.env.TRIGGER_WEBHOOK_SECRET;
    const token = url.searchParams.get("token");
    if (!secret || token !== secret) return apiError("Unauthorized.", 401);

    const mapped = mapKlingWebhookPayload(body);
    if (!mapped) return apiOk({ ok: true, skipped: "not terminal status" });

    const generation = await getGenerationByProviderJobId(mapped.providerJobId);
    if (!generation) return apiError("Generation not found for provider job", 404);

    if (mapped.status === "failed") {
      await completeGeneration({ generationId: generation.id, status: "failed", error: mapped.error });
    } else {
      await completeGeneration({
        generationId: generation.id,
        status: "succeeded",
        videoUrl: mapped.videoUrl,
        durationSeconds: mapped.durationSeconds,
      });
    }
    return apiOk({ ok: true });
  }

  // Internal webhook (Veo, Sora via Trigger.dev) — this app calling itself back.
  if (!isAuthorizedWebhook(req)) return apiError("Unauthorized.", 401);
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
