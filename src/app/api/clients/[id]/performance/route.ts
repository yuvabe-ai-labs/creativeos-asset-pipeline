import { NextRequest } from "next/server";
import { apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { getBrandDetails } from "@/lib/db/brand-kit";
import {
  getLatestSnapshot,
  listFollowerSeries,
  listTrackedPosts,
} from "@/lib/db/performance";
import { computeStats, parseInstagramHandle } from "@/lib/market/performance";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withClient(req, params, async (clientId) =>
    withTryCatch("Could not load performance data.", async () => {
      const [details, latest, seriesRows, posts] = await Promise.all([
        getBrandDetails(clientId),
        getLatestSnapshot(clientId),
        listFollowerSeries(clientId),
        listTrackedPosts(clientId),
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
        handle: parseInstagramHandle(details.instagram),
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
