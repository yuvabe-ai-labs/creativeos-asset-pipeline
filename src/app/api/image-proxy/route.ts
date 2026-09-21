import { apiError } from "@/lib/api/route-helpers";

// Same-origin media proxy for canvas readback (D37 §8). GCS public objects don't send CORS
// headers, so a `crossOrigin` load fails and the pixels can't be read back out of a canvas
// to composite drawn marks. Streaming the bytes from our own origin makes the object
// same-origin, so canvas readback (toDataURL) is allowed with no bucket-CORS change.
//
// Named for its first consumer, but it serves VIDEO too now: the review-annotation flow
// points the player here while a senior is annotating, so a paused frame can be captured
// (D245). That is why Range requests matter — see below.
//
// Locked to the storage host so this is not an open relay (SSRF).
const ALLOWED_PREFIX = "https://storage.googleapis.com/";

// Headers that must survive the hop for a <video> to behave. Without content-range +
// accept-ranges the browser cannot do byte-range seeks: it downloads linearly and
// `currentTime = x` lands wherever it happens to have buffered, so scrubbing does not
// match the timecode. That is exactly what a frame annotation depends on being exact.
const PASS_THROUGH = ["content-range", "content-length", "content-type", "etag", "last-modified"];

export async function GET(req: Request) {
  const target = new URL(req.url).searchParams.get("url");
  if (!target || !target.startsWith(ALLOWED_PREFIX)) {
    return apiError("Invalid or disallowed media url", 400);
  }

  // Forward the browser's Range verbatim; GCS answers with 206 + content-range.
  const range = req.headers.get("range");
  let upstream: Response;
  try {
    upstream = await fetch(target, range ? { headers: { Range: range } } : undefined);
  } catch {
    return apiError("Failed to fetch media", 502);
  }
  // 206 counts as ok() — a partial response is the SUCCESS case for a seeking player.
  if (!upstream.ok || !upstream.body) {
    return apiError("Failed to fetch media", upstream.status || 502);
  }

  const headers = new Headers({
    "content-type": upstream.headers.get("content-type") ?? "image/png",
    "cache-control": "private, max-age=300",
    // Belt-and-suspenders: allow canvas readback even if fetched cross-origin.
    "access-control-allow-origin": "*",
    // Advertise range support even on the initial 200, or the player never tries.
    "accept-ranges": "bytes",
  });
  for (const name of PASS_THROUGH) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }

  // Mirror upstream's status so a 206 stays a 206 — collapsing it to 200 tells the
  // player it received the whole file when it received one slice.
  return new Response(upstream.body, { status: upstream.status, headers });
}
