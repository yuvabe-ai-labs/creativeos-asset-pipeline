// EXPERIMENT (throwaway) — create a Seedance video task, step 2 of the probe.
import { apiError, apiOk, withTryCatch } from "@/lib/api/route-helpers";
import { createVideoTask, type VideoContentPart } from "@/lib/lab/seedance/client";
import { DEFAULT_DURATION } from "@/lib/lab/seedance/constants";

type Body = {
  prompt?: string;
  // Seedream output URL, or an asset://<id> digital character.
  referenceUrl?: string;
  resolution?: string;
  ratio?: string;
  duration?: number;
  generateAudio?: boolean;
};

export async function POST(req: Request) {
  return withTryCatch("Seedance request failed", async () => {
    const body = (await req.json()) as Body;
    const prompt = body.prompt?.trim();
    if (!prompt) return apiError("prompt is required", 400);

    // Seedance takes generation settings as --flags appended to the text prompt,
    // not as JSON fields — an unusual API shape that is easy to get wrong.
    const flags = [
      `--resolution ${body.resolution || "720p"}`,
      `--duration ${body.duration || DEFAULT_DURATION}`,
      `--ratio ${body.ratio || "adaptive"}`,
      `--watermark false`,
    ].join(" ");

    const content: VideoContentPart[] = [{ type: "text", text: `${prompt} ${flags}` }];

    if (body.referenceUrl?.trim()) {
      content.push({
        type: "image_url",
        image_url: { url: body.referenceUrl.trim() },
        role: "reference_image",
      });
    }

    const result = await createVideoTask(content);
    return apiOk(result);
  });
}
