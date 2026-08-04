import { estimateImageGenerationCostUsd } from "@/lib/image-gen/estimate";
import { usdToFinalCredits } from "@/lib/credits/units";
import { imageGenRegistry } from "@/lib/image-gen/registry";
import { apiError, apiOk, withNode } from "@/lib/api/route-helpers";

// Read-only preview — never writes to generations or credit_transactions. Reuses the exact
// same computation image-generate/route.ts reserves against (estimateImageGenerationCostUsd),
// so the number shown here always matches what the real request would reserve.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withNode(req, params, async () => {
    const body = (await req.json().catch(() => null)) as
      | {
          modelId?: unknown;
          quality?: unknown;
          aspect_ratio?: unknown;
          image_size?: unknown;
          prompt?: unknown;
          referenceUrls?: unknown;
        }
      | null;

    const modelId = typeof body?.modelId === "string" ? body.modelId : null;
    if (!modelId || !imageGenRegistry[modelId]) {
      return apiError(`Unknown modelId: ${modelId}`, 400);
    }
    const prompt = typeof body?.prompt === "string" ? body.prompt : "";
    const referenceUrls = Array.isArray(body?.referenceUrls)
      ? (body.referenceUrls as unknown[]).filter((u): u is string => typeof u === "string")
      : [];

    const costUsd = await estimateImageGenerationCostUsd({
      modelId,
      quality: typeof body?.quality === "string" ? body.quality : undefined,
      aspectRatio: typeof body?.aspect_ratio === "string" ? body.aspect_ratio : undefined,
      imageSize: typeof body?.image_size === "string" ? body.image_size : undefined,
      prompt,
      referenceUrls,
    });

    return apiOk({
      estimatedCredits: costUsd === null ? null : usdToFinalCredits(costUsd),
    });
  });
}
