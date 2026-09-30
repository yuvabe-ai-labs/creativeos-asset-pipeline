// UGC bench — generate with Gemini Omni. Synchronous: one call returns the finished video,
// so there is no task id and nothing to poll (unlike Seedance).
import { apiError, apiOk, withTryCatch } from "@/lib/api/route-helpers";
import { DEFAULT_OMNI_SETTINGS, type BenchSettings } from "@/lib/ugc/constants";
import { generateOmniVideo } from "@/lib/ugc/omni";

type Body = { script?: string; referenceUrl?: string; settings?: Partial<BenchSettings> };

export async function POST(req: Request) {
  return withTryCatch("Omni request failed", async () => {
    const body = (await req.json()) as Body;
    if (!body.script?.trim()) return apiError("script is required", 400);
    if (!body.referenceUrl) return apiError("referenceUrl is required", 400);

    const settings = { ...DEFAULT_OMNI_SETTINGS, ...body.settings };
    const { videoUri, error } = await generateOmniVideo({
      faceUrl: body.referenceUrl,
      script: body.script,
      settings,
    });

    // Google's file URI needs the API key to download, so the browser can't play it directly —
    // it plays the proxy below instead.
    return apiOk({
      videoUrl: videoUri ? `/api/ugc/omni/file?uri=${encodeURIComponent(videoUri)}` : null,
      error,
    });
  });
}
