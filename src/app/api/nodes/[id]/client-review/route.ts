import { logClientReviewErrors } from "@/lib/client-review/log";
import { apiError, apiOk, withNode, withTryCatch } from "@/lib/api/route-helpers";
import { sharePathFor } from "@/lib/client-review/paths";
import { generateShareToken } from "@/lib/client-review/token";
import { isCutPathFor } from "@/lib/client-review/validate";
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
    logClientReviewErrors("read", req, () => withNode(req, params, async (nodeId, node) => {
      if (node.type !== "client-review") return apiError("Node not found.", 404);
      return apiOk(await payload(await getReviewByNodeId(nodeId)));
    })),
  );
}

// POST /api/nodes/:id/client-review — finalize an upload: record the cut and mint the
// share token, so the link exists as soon as the video does.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withTryCatch("Could not save the cut.", () =>
    logClientReviewErrors("finalize", req, () => withNode(req, params, async (nodeId, node, caller, clientId) => {
      if (node.type !== "client-review") return apiError("Node not found.", 404);
      const body = (await req.json().catch(() => null)) as { path?: string } | null;
      if (typeof body?.path !== "string" || !body.path) {
        return apiError("path is required.", 400);
      }
      // A client could otherwise finalize with an arbitrary path and point the
      // public link at someone else's object.
      const prefix = clientReviewPrefix({ clientId, canvasId: node.canvas_id, nodeId });
      if (!isCutPathFor(prefix, body.path)) {
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
    })),
  );
}
