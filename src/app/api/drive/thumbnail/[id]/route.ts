import { NextRequest, NextResponse } from "next/server";
import { exchangeRefreshToken } from "@/lib/drive/client";
import { apiError } from "@/lib/api/route-helpers";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // TODO D14: No auth check — relies on the Drive file IDs being unguessable (security-through-obscurity).
  // Add proper session auth once D14 (auth) is implemented.
  const { id } = await params;

  let accessToken: string;
  try {
    accessToken = await exchangeRefreshToken();
  } catch {
    return apiError("Could not connect to Google Drive. Check server configuration.", 500);
  }

  // Fetch the thumbnailLink from the Drive Files API
  const metaUrl = `https://www.googleapis.com/drive/v3/files/${id}?fields=thumbnailLink`;
  const metaRes = await fetch(metaUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!metaRes.ok) {
    const text = await metaRes.text();
    return apiError(`Drive API error: ${text}`, 502);
  }

  const meta = (await metaRes.json()) as { thumbnailLink?: string };
  if (!meta.thumbnailLink) {
    return apiError("No thumbnail available for this file", 404);
  }

  // Fetch the actual thumbnail bytes — thumbnailLink is a pre-signed URL, no auth header needed
  const thumbRes = await fetch(meta.thumbnailLink);

  if (!thumbRes.ok) {
    return apiError("Failed to fetch thumbnail image", 502);
  }

  const contentType = thumbRes.headers.get("content-type") ?? "image/jpeg";
  const buffer = await thumbRes.arrayBuffer();

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=300",
    },
  });
}
