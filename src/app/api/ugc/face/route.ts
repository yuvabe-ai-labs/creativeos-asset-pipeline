// UGC bench — Seedream text-to-image. A moderation rejection is a result, not a 500.
import { apiError, apiOk, withTryCatch } from "@/lib/api/route-helpers";
import { generateImage } from "@/lib/ugc/client";

export async function POST(req: Request) {
  return withTryCatch("Seedream request failed", async () => {
    const { prompt } = (await req.json()) as { prompt?: string };
    if (!prompt?.trim()) return apiError("prompt is required", 400);
    return apiOk(await generateImage(prompt.trim()));
  });
}
