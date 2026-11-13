import { NextResponse } from "next/server";
import { apiError, withShareToken, withQuietErrors } from "@/lib/api/route-helpers";
import { cutDownloadName } from "@/lib/client-review/utils";
import { signCutDownloadUrl } from "@/lib/storage";

// GET /api/r/:token/download — public (D478). Sends the browser to a short-lived signed URL that
// saves the link's version under the review's title; the bytes go straight from storage. D497:
// a version with Allow download off answers 404, also for a page opened before it was turned off.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  return withQuietErrors("Could not download the video.", () =>
    withShareToken(params, async (review, version) => {
      if (!version.allow_download) return apiError("Download is off for this version.", 404);
      const url = await signCutDownloadUrl(version.video_path, cutDownloadName(version.title || review.title, version.video_path));
      return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "no-store" } });
    }),
  );
}
