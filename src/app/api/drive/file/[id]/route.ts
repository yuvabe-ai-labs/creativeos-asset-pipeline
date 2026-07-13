import { NextRequest, NextResponse } from "next/server";
import { exchangeRefreshToken } from "@/lib/drive/client";
import { apiError } from "@/lib/api/route-helpers";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // TODO D14: No auth check — relies on the Drive file IDs being unguessable.
  // Add proper session auth once D14 (auth) is implemented.
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
