import { NextRequest, NextResponse } from "next/server";
import { exchangeRefreshToken } from "@/lib/drive/client";
import { apiError, withAccess } from "@/lib/api/route-helpers";

async function readDrive(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let accessToken: string;
  try {
    accessToken = await exchangeRefreshToken();
  } catch {
    return apiError(
      "Could not connect to Google Drive. Check server configuration.",
      500,
    );
  }

  // Stream the actual file bytes via alt=media.
  const url = `https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const text = await res.text();
    return apiError(`Drive API error: ${text}`, 502);
  }

  const contentType = res.headers.get("content-type") ?? "application/octet-stream";
  const buffer = await res.arrayBuffer();

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
