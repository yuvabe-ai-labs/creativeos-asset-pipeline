import { NextRequest } from "next/server";
import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import {
  isHandleTracked,
  getLatestSnapshot,
  listFollowerSeries,
  listTrackedPosts,
} from "@/lib/db/performance";
import {
  computeStats,
  extractIdentity,
  parseInstagramHandle,
} from "@/lib/market/performance";

/** One handle's sub-tab payload (D253). Scoped to a single tracked handle — a client
 *  may track several and each stands alone. Reads nothing from Brand Kit (D252). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withClient(req, params, async (clientId) =>
    withTryCatch("Could not load performance data.", async () => {
      const handle = parseInstagramHandle(new URL(req.url).searchParams.get("handle"));
      if (!handle) return apiError("A handle is required.", 400);

      // Enrolment is checked before any read: an untracked handle is a 404, not an
      // empty tab, so a stale link cannot look like an account with no data.
      if (!(await isHandleTracked(clientId, handle))) {
        return apiError("That handle isn't tracked for this client.", 404);
      }

      const [latest, seriesRows, posts] = await Promise.all([
        getLatestSnapshot(clientId, handle),
        listFollowerSeries(clientId, handle),
        listTrackedPosts(clientId, handle),
      ]);
      const series = seriesRows.map((r) => ({
        capturedAt: r.captured_at,
        followers: r.followers_count,
      }));
      const stats = computeStats({
        posts: posts.map((p) => ({
          likesCount: p.likes_count,
          commentsCount: p.comments_count,
          postedAt: p.posted_at,
        })),
        followers: latest?.followers_count ?? null,
        series,
      });
      return apiOk({
        handle,
        // Category / external link / avatar live only in the stored payload (D237),
        // so the identity strip costs a read of `raw` rather than a re-scrape.
        identity: latest ? extractIdentity(latest.raw) : null,
        latest: latest
          ? {
              followersCount: latest.followers_count,
              followsCount: latest.follows_count,
              postsCount: latest.posts_count,
              capturedAt: latest.captured_at,
            }
          : null,
        series,
        posts,
        stats,
      });
    }),
  );
}
