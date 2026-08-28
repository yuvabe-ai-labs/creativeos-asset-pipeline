import "server-only";

/**
 * An image URL as base64 bytes plus its mime type.
 *
 * Veo's SDK Image_2 accepts only gcsUri or imageBytes, and Gemini Omni's REST image content part
 * takes base64 `data` — but every image in this pipeline is a Supabase Storage HTTPS URL, so both
 * providers must fetch first. Content-type is split on ";" to drop any charset parameter.
 */
export async function fetchAsBase64(
  url: string,
): Promise<{ imageBytes: string; mimeType: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image (${res.status}): ${url}`);
  const mimeType = (res.headers.get("content-type") ?? "image/jpeg").split(";")[0].trim();
  const imageBytes = Buffer.from(await res.arrayBuffer()).toString("base64");
  return { imageBytes, mimeType };
}
