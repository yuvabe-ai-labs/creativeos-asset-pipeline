import { NextResponse } from "next/server";
import { withShareToken, withQuietErrors } from "@/lib/api/route-helpers";
import { cutDownloadName } from "@/lib/client-review/utils";
import { signCutDownloadUrl } from "@/lib/storage";

// GET /api/r/:token/download — public (D472). Sends the browser to a short-lived signed URL that
// saves the cut under the review's title; the bytes go straight from storage, not through here.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  return withQuietErrors("Could not download the video.", () =>
    withShareToken(params, async (review) => {
      const url = await signCutDownloadUrl(review.video_path, cutDownloadName(review.title, review.video_path));
      return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "no-store" } });
    }),
  );
}
