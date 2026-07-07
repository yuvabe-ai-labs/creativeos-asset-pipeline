import { apiError } from "@/lib/api/route-helpers";

// Same-origin image proxy for the annotation canvas (D37 §8). GCS public objects don't send
// CORS headers, so a `crossOrigin` load fails and the base image can't be read back out of a
// canvas to composite the drawn marks. Streaming the bytes from our own origin makes the image
// same-origin, so canvas readback (toDataURL) is allowed with no bucket-CORS change.
//
// Locked to the storage host so this is not an open relay (SSRF).
const ALLOWED_PREFIX = "https://storage.googleapis.com/";

export async function GET(req: Request) {
  const target = new URL(req.url).searchParams.get("url");
  if (!target || !target.startsWith(ALLOWED_PREFIX)) {
    return apiError("Invalid or disallowed image url", 400);
  }

  let upstream: Response;
  try {
    upstream = await fetch(target);
  } catch {
    return apiError("Failed to fetch image", 502);
  }
  if (!upstream.ok || !upstream.body) {
    return apiError("Failed to fetch image", upstream.status || 502);
  }

  const contentType = upstream.headers.get("content-type") ?? "image/png";
  return new Response(upstream.body, {
    headers: {
      "content-type": contentType,
      "cache-control": "private, max-age=300",
      // Belt-and-suspenders: allow canvas readback even if fetched cross-origin.
      "access-control-allow-origin": "*",
    },
  });
}
