// src/app/api/r/s/[token]/route.ts
import { apiError, apiOk, withQuietErrors, withScriptShareToken } from "@/lib/api/route-helpers";
import { buildPublicScriptReview } from "@/lib/script-review/load";

// GET /api/r/s/:token — public (D356). Refreshes the page after the client's own post, edit or
// approval; the first load is server-rendered by src/app/r/s/[token]/page.tsx.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  return withQuietErrors("Could not load the review.", () =>
    withScriptShareToken(params, async (review) => {
      const body = await buildPublicScriptReview(review);
      if (!body) return apiError("Review not found.", 404);
      return apiOk(body);
    }),
  );
}
