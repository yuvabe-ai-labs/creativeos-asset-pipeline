import { completeGeneration } from "@/lib/generations/complete";
import { apiError, apiOk } from "@/lib/api/route-helpers";

export async function POST(req: Request) {
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
