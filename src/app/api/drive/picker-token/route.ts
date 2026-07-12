import { NextResponse } from "next/server";
import { exchangeRefreshToken } from "@/lib/drive/client";
import { apiError } from "@/lib/api/route-helpers";

// TODO: tighten this gate when proper auth lands (D14). For now, the access
// token has a 1h TTL and drive.readonly scope — restrict to same-site callers.
export async function GET(req: Request) {
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
