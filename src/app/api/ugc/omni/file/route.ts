// UGC bench — stream an Omni video back to the browser.
// The Files URI only serves with `x-goog-api-key`, which must never reach the client, so the
// <video> element points here and this route adds the key.
import { apiError } from "@/lib/api/route-helpers";
import { apiKey } from "@/lib/ugc/omni";

// Only Google's own generative-language files, so this can't fetch arbitrary URLs.
const ALLOWED = /^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/files\//;

// Not wrapped in withTryCatch: that helper returns NextResponse, and this route streams the
// upstream body back as a plain Response so a video never buffers through memory.
export async function GET(req: Request) {
  try {
    const uri = new URL(req.url).searchParams.get("uri") ?? "";
    if (!ALLOWED.test(uri)) return apiError("Not a Gemini file URI", 400);

    const upstream = await fetch(uri, { headers: { "x-goog-api-key": apiKey() }, cache: "no-store" });
    if (!upstream.ok || !upstream.body) {
      return apiError(`Could not fetch the video (HTTP ${upstream.status})`, 502);
    }

    return new Response(upstream.body, {
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "video/mp4",
        "Content-Disposition": 'inline; filename="omni.mp4"',
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (e) {
    console.error("[ugc] omni file proxy failed", e);
    return apiError(e instanceof Error ? e.message : "Omni file fetch failed", 500);
  }
}
