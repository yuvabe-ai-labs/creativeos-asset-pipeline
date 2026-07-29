// Browser-side direct-to-GCS upload. Splits an upload into three hops so the
// file bytes never pass through a Vercel Function (which caps request bodies at
// 4.5 MB): (1) POST metadata to a `sign` endpoint, (2) PUT the raw bytes straight
// to the returned GCS signed URL, (3) POST to a `finalize` endpoint to record the
// object in the database. Do NOT import "server-only" — this runs in the browser.

type SignResponse = { signedUrl: string; path: string; url: string };

export type UploadViaSignedUrlOptions = {
  signEndpoint: string;
  finalizeEndpoint: string;
  // Extra fields merged into the sign request body (e.g. quota context).
  signBody?: Record<string, unknown>;
  // Extra fields merged into the finalize request body (e.g. image dimensions).
  finalizeBody?: Record<string, unknown>;
};

// Uploads `file` and returns the parsed JSON from the finalize endpoint (T is the
// caller's expected response shape). Throws with a user-facing message on failure.
export async function uploadViaSignedUrl<T>(
  file: File,
  opts: UploadViaSignedUrlOptions,
): Promise<T> {
  const contentType = file.type || "application/octet-stream";

  // 1. Ask the server to validate and authorize the upload.
  const signRes = await fetch(opts.signEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: file.name,
      contentType,
      size: file.size,
      ...opts.signBody,
    }),
  });
  const sign = (await signRes.json()) as SignResponse & { error?: string };
  if (!signRes.ok) throw new Error(sign.error ?? "Could not authorize upload.");

  // 2. Send the bytes directly to GCS. Content-Type MUST match what was signed.
  const putRes = await fetch(sign.signedUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: file,
  });
  if (!putRes.ok) throw new Error("Upload to storage failed.");

  // 3. Record the stored object in the database.
  const finalizeRes = await fetch(opts.finalizeEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      path: sign.path,
      filename: file.name,
      size: file.size,
      ...opts.finalizeBody,
    }),
  });
  const finalized = (await finalizeRes.json()) as T & { error?: string };
  if (!finalizeRes.ok) {
    throw new Error(finalized.error ?? "Failed to finalize upload.");
  }
  return finalized;
}

// Reads an image's pixel dimensions in the browser. Replaces the server-side
// sharp() call, which is no longer possible once bytes go straight to GCS.
export async function readImageSize(
  file: File,
): Promise<{ imageWidth?: number; imageHeight?: number }> {
  try {
    const bitmap = await createImageBitmap(file);
    const size = { imageWidth: bitmap.width, imageHeight: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return {};
  }
}
