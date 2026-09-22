// UGC bench — "Use this voice": pull the audio out of a finished Seedance clip so it can be
// sent back as `reference_audio` for every other generation of that face.
import { apiError, apiOk, withTryCatch } from "@/lib/api/route-helpers";
import { extractVoice } from "@/lib/ugc/voice";

// Only fetch from BytePlus's own output hosts — this route must not become a way to make
// our server download arbitrary URLs.
const ALLOWED_HOST = /(^|\.)(volces\.com|bytepluses\.com|byteplus\.com)$/i;
// A 30s 1080p Seedance clip is well under this; anything bigger isn't a bench clip.
const MAX_VIDEO_BYTES = 80 * 1024 * 1024;

export async function POST(req: Request) {
  return withTryCatch("Voice extraction failed", async () => {
    const { videoUrl } = (await req.json()) as { videoUrl?: string };
    let url: URL;
    try {
      url = new URL(videoUrl ?? "");
    } catch {
      return apiError("videoUrl is required", 400);
    }
    if (url.protocol !== "https:" || !ALLOWED_HOST.test(url.hostname)) {
      return apiError("Only BytePlus output URLs can be used as a voice source", 400);
    }

    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      // Seedance links expire after 24h (and after 100 downloads).
      return apiError(`Could not download the clip (HTTP ${res.status}) — it may have expired`, 502);
    }
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length > MAX_VIDEO_BYTES) return apiError("Clip is too large to use as a voice", 413);

    try {
      const { mp3, seconds } = await extractVoice(bytes);
      return apiOk({
        audioDataUrl: `data:audio/mp3;base64,${mp3.toString("base64")}`,
        seconds,
      });
    } catch (e) {
      console.error("[ugc] voice extraction failed", e);
      return apiError(e instanceof Error ? e.message : "Voice extraction failed", 422);
    }
  });
}
