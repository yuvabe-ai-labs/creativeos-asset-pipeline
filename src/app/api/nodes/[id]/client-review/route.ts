import { apiError, apiOk, withNode, withTryCatch } from "@/lib/api/route-helpers";
import { sharePathFor } from "@/lib/client-review/paths";
import { generateShareToken } from "@/lib/client-review/token";
import { cutExtension } from "@/lib/client-review/validate";
import { toReviewComment, type CanvasReviewRow, type NodeClientReview } from "@/lib/client-review/wire";
import { createReview, getReviewByNodeId, listComments, ReviewExistsError } from "@/lib/db/client-reviews";
import { publicUrlFor } from "@/lib/storage";
import { clientReviewPrefix } from "@/lib/storage/paths";

async function payload(review: CanvasReviewRow | null): Promise<NodeClientReview> {
  if (!review) return { review: null, comments: [] };
  const rows = await listComments(review.id);
  return {
    review: { videoUrl: publicUrlFor(review.video_path), sharePath: sharePathFor(review.share_token) },
    comments: rows.map(toReviewComment),
  };
}

// GET /api/nodes/:id/client-review — the node's cut, share path and comments (team view).
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withTryCatch("Could not load the review.", () =>
    withNode(req, params, async (nodeId) => apiOk(await payload(await getReviewByNodeId(nodeId)))),
  );
}

// POST /api/nodes/:id/client-review — finalize an upload: record the cut and mint the
// share token, so the link exists as soon as the video does.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withTryCatch("Could not save the cut.", () =>
    withNode(req, params, async (nodeId, node, caller, clientId) => {
      const body = (await req.json().catch(() => null)) as { path?: string; filename?: string } | null;
      if (!body?.path || !body.filename || !cutExtension(body.filename)) {
        return apiError("path and a video filename are required.", 400);
      }
      // A client could otherwise finalize with an arbitrary path and point the
      // public link at someone else's object.
      const prefix = clientReviewPrefix({ clientId, canvasId: node.canvas_id, nodeId });
      if (!body.path.startsWith(prefix)) {
        return apiError("Upload path does not belong to this node.", 400);
      }
      try {
        const review = await createReview({
          canvasId: node.canvas_id,
          nodeId,
          videoPath: body.path,
          shareToken: generateShareToken(),
          createdBy: caller.userId,
        });
        return apiOk(await payload(review), 201);
      } catch (e) {
        if (e instanceof ReviewExistsError) return apiError(e.message, 409);
        throw e;
      }
    }),
  );
}
