// UGC bench — create a Seedance task from a script + a Seedream face.
import { apiError, apiOk, withTryCatch } from "@/lib/api/route-helpers";
import { createVideoTask } from "@/lib/ugc/client";
import { DEFAULT_SETTINGS, SEEDANCE_MODELS, type BenchSettings } from "@/lib/ugc/constants";
import { buildSeedancePrompt } from "@/lib/ugc/prompt";

type Body = { script?: string; referenceUrl?: string; settings?: Partial<BenchSettings> };

export async function POST(req: Request) {
  return withTryCatch("Seedance request failed", async () => {
    const body = (await req.json()) as Body;
    if (!body.script?.trim()) return apiError("script is required", 400);
    if (!body.referenceUrl) return apiError("referenceUrl is required", 400);

    const settings = { ...DEFAULT_SETTINGS, ...body.settings };
    if (!SEEDANCE_MODELS.some((m) => m.id === settings.model)) {
      return apiError("unknown model", 400);
    }

    return apiOk(
      await createVideoTask({
        model: settings.model,
        prompt: buildSeedancePrompt(body.script, settings),
        referenceUrl: body.referenceUrl,
      }),
    );
  });
}
