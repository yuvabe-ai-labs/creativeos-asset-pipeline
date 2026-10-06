import { apiOk, withShareToken, withTryCatch } from "@/lib/api/route-helpers";
import { buildPublicReview } from "@/lib/client-review/load";

// GET /api/r/:token — public (D279). Used to refresh the list after a post or edit;
// the first load is server-rendered by src/app/r/[token]/page.tsx.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  return withTryCatch("Could not load the review.", () =>
    withShareToken(params, async (review) => apiOk(await buildPublicReview(review))),
  );
}
