import { logClientReviewErrors } from "@/lib/client-review/log";
import { apiError, apiOk, withNode, withTryCatch } from "@/lib/api/route-helpers";
import { sharePathFor } from "@/lib/client-review/paths";
import { MAX_CODE_EXTRA, shareCodeFor } from "@/lib/client-review/token";
import { isCutPathFor } from "@/lib/client-review/validate";
import { toReviewComment, type CanvasReviewRow, type NodeClientReview } from "@/lib/client-review/wire";
import {
  createReview,
  getReviewByNodeId,
  listComments,
  ReviewExistsError,
  ShareCodeTakenError,
} from "@/lib/db/client-reviews";
import { publicUrlFor } from "@/lib/storage";
import { clientReviewPrefix } from "@/lib/storage/paths";

// The link carries the node's CURRENT title (D311), so a rename shows up in Copy link at once;
// older links keep working because lookups ignore the title part.
function nodeTitle(data: Record<string, unknown>): string {
  return typeof data.title === "string" ? data.title : "";
}

async function payload(review: CanvasReviewRow | null, title: string): Promise<NodeClientReview> {
  if (!review) return { review: null, comments: [] };
  const rows = await listComments(review.id);
  return {
    review: {
      videoUrl: publicUrlFor(review.video_path),
      sharePath: sharePathFor(review.share_token, title),
    },
    comments: rows.map(toReviewComment),
  };
}

// GET /api/nodes/:id/client-review — the node's cut, share path and comments (team view).
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withTryCatch("Could not load the review.", () =>
    logClientReviewErrors("read", req, () => withNode(req, params, async (nodeId, node) => {
      if (node.type !== "client-review") return apiError("Node not found.", 404);
      return apiOk(await payload(await getReviewByNodeId(nodeId), nodeTitle(node.data)));
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
      // D311: the share code is the node id's first 4 hex characters, one longer per clash.
      for (let extra = 0; extra <= MAX_CODE_EXTRA; extra++) {
        try {
          const review = await createReview({
            canvasId: node.canvas_id,
            nodeId,
            videoPath: body.path,
            shareToken: shareCodeFor(nodeId, extra),
            createdBy: caller.userId,
          });
          return apiOk(await payload(review, nodeTitle(node.data)), 201);
        } catch (e) {
          if (e instanceof ShareCodeTakenError) continue;
          if (e instanceof ReviewExistsError) return apiError(e.message, 409);
          throw e;
        }
      }
      return apiError("Could not create a share link for this cut.", 500);
    })),
  );
}
