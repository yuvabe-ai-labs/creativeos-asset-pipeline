export async function fetchBytes(url: string, headers?: Record<string, string>): Promise<Buffer> {
  const res = await fetch(url, headers ? { headers } : undefined);
  if (!res.ok) throw new Error(`Download failed (${res.status}) for ${url.split("?")[0]}`);
  return Buffer.from(await res.arrayBuffer());
}

/** PUT to a V4 signed URL. The Content-Type must match the one the URL was signed with. */
export async function putBytes(url: string, body: Buffer, contentType: string): Promise<void> {
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: new Uint8Array(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Upload failed (${res.status}): ${detail.slice(0, 200)}`);
  }
}
