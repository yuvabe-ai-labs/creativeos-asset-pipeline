import { NextResponse } from "next/server";
import { exchangeRefreshToken } from "@/lib/drive/client";
import { apiError, withAccess } from "@/lib/api/route-helpers";

// The token is for the platform-wide Drive account (1h TTL, drive.readonly), so only same-site
// callers get it.
async function readDrive(req: Request) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (origin && host && !origin.includes(host.split(":")[0])) {
    return apiError("Forbidden", 403);
  }

  try {
    const accessToken = await exchangeRefreshToken();
    const clientId = process.env.GDRIVE_CLIENT_ID ?? "";
    return NextResponse.json(
      { accessToken, clientId },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return apiError("Could not connect to Google Drive. Check server configuration.", 500);
  }
}

// Every agency reads Drive through ONE platform-wide token (known limitation, plan 1), so the
// Drive routes need canvas edit, checked through withAccess.
export async function GET(req: Request) {
  return withAccess(req, { need: "canvases.edit" }, () => readDrive(req));
}
