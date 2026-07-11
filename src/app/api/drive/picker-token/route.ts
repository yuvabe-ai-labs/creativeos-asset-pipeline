import { NextResponse } from "next/server";
import { exchangeRefreshToken } from "@/lib/drive/client";

export async function GET() {
  try {
    const accessToken = await exchangeRefreshToken();
    const clientId = process.env.GDRIVE_CLIENT_ID ?? "";
    return NextResponse.json({ accessToken, clientId });
  } catch {
    return NextResponse.json(
      { error: "Could not connect to Google Drive. Check server configuration." },
      { status: 500 }
    );
  }
}
