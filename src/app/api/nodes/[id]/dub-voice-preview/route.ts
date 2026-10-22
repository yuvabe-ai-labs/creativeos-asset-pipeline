import { z } from "zod";
import { apiError, apiOk, withNode, withTryCatch } from "@/lib/api/route-helpers";
import { textToSpeech } from "@/lib/sarvam/client";
import { publicUrlFor, uploadDubVoicePreview } from "@/lib/storage";
import { DUBBING_NOT_SET_UP_MESSAGE } from "@/lib/dubbing/copy";
import { isDubLanguage, isDubVoice } from "@/lib/dubbing/types";
import { pathForDubVoicePreview, previewLanguage, previewText } from "@/lib/dubbing/voice-preview";

const BodySchema = z.object({ voice: z.string().refine(isDubVoice), language: z.string().refine(isDubLanguage) });

// D379 — a preset voice's preview, in the language being dubbed into. Made once with the
// vendor's text-to-speech and kept in storage; every later request is the stored file.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withNode(req, params, (_nodeId, node) =>
    withTryCatch("Couldn't load the preview. Try again.", async () => {
      if (node.type !== "dubbing") return apiError("Node not found.", 404);
      const parsed = BodySchema.safeParse(await req.json().catch(() => null));
      if (!parsed.success || !isDubVoice(parsed.data.voice) || !isDubLanguage(parsed.data.language)) {
        return apiError("Pick a voice to preview.", 400);
      }
      const { voice, language } = parsed.data;
      const path = pathForDubVoicePreview(voice, language);
      const url = publicUrlFor(path);
      const stored = await fetch(url, { method: "HEAD" }).then((r) => r.ok).catch(() => false);
      if (stored) return apiOk({ url });
      if (!process.env.SARVAM_API_KEY) return apiError(DUBBING_NOT_SET_UP_MESSAGE, 400);
      const wav = await textToSpeech({ text: previewText(language), language: previewLanguage(language), speaker: voice });
      await uploadDubVoicePreview(path, wav);
      return apiOk({ url });
    }),
  );
}
