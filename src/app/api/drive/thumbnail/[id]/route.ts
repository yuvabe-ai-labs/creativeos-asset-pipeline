import { NextRequest, NextResponse } from "next/server";
import { exchangeRefreshToken } from "@/lib/drive/client";
import { apiError, withAccess } from "@/lib/api/route-helpers";

async function readDrive(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

// Every agency reads Drive through ONE platform-wide token (known limitation, plan 1), so the
// Drive routes need canvas edit, checked through withAccess.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return withAccess(req, { need: "edit" }, () => readDrive(req, ctx));
}
