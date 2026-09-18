// EXPERIMENT (throwaway) — Seedream text-to-image, step 1 of the human-reference probe.
import { apiError, apiOk, withTryCatch } from "@/lib/api/route-helpers";
import { generateImage } from "@/lib/lab/seedance/client";

export async function POST(req: Request) {
  return withTryCatch("Seedream request failed", async () => {
    const { prompt, size } = (await req.json()) as { prompt?: string; size?: string };
    if (!prompt?.trim()) return apiError("prompt is required", 400);

    const result = await generateImage(prompt.trim(), size || "2K");
    // A non-2xx from ModelArk is a result to display, not a server fault — moderation
    // rejections are exactly what this experiment is looking for.
    return apiOk(result);
  });
}
