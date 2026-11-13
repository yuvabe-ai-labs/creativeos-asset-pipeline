import { logClientReviewErrors } from "@/lib/client-review/log";
import { apiError, apiOk, withNode, withTryCatch } from "@/lib/api/route-helpers";
import { MAX_CODE_EXTRA, shareCodeFor } from "@/lib/client-review/token";
import { isCutPathFor } from "@/lib/client-review/validate";
import { titleFromFilename } from "@/lib/nodes/title";
import {
  toReviewComment,
  toReviewVersion,
  type CanvasReviewRow,
  type NodeClientReview,
} from "@/lib/client-review/wire";
import {
  createReview,
  createVersion,
  getReviewByNodeId,
  listReviewComments,
  listVersions,
  ReviewExistsError,
  ShareCodeTakenError,
} from "@/lib/db/client-reviews";
import { publicUrlFor } from "@/lib/storage";
import { clientReviewPrefix } from "@/lib/storage/paths";

// The share code only. The focus view builds each version's link from the node's live title
// (sharePathFor, D311/D496), so a rename shows up in Copy link at once.
async function clientReviewPayload(review: CanvasReviewRow | null): Promise<NodeClientReview> {
  if (!review) return { review: null, comments: [] };
  const [versions, comments] = await Promise.all([listVersions(review.id), listReviewComments(review.id)]);
  return {
    review: {
      shareToken: review.share_token,
      versions: versions.map((v) => toReviewVersion(v, publicUrlFor(v.video_path))),
    },
    comments: comments.map(toReviewComment),
  };
}

// D311: the share code is the node id's first 4 hex characters, one longer per clash. Another
// upload may have made the review a moment ago (ReviewExistsError): use that one.
async function ensureReview(input: { canvasId: string; nodeId: string; createdBy: string }): Promise<CanvasReviewRow> {
  for (let extra = 0; extra <= MAX_CODE_EXTRA; extra++) {
    try {
      return await createReview({ ...input, shareToken: shareCodeFor(input.nodeId, extra) });
    } catch (e) {
      if (e instanceof ShareCodeTakenError) continue;
      if (e instanceof ReviewExistsError) {
        const existing = await getReviewByNodeId(input.nodeId);
        if (existing) return existing;
      }
      throw e;
    }
  }
  throw new Error("Could not create a share link for this cut.");
}

// GET /api/nodes/:id/client-review — the node's versions and every version's comments (team view).
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withTryCatch("Could not load the review.", () =>
    logClientReviewErrors("read", req, () => withNode(req, params, async (nodeId, node) => {
      if (node.type !== "client-review") return apiError("Node not found.", 404);
      return apiOk(await clientReviewPayload(await getReviewByNodeId(nodeId)));
    })),
  );
}

// POST /api/nodes/:id/client-review — finalize an upload as the node's next version (D495): v1
// also makes the review and its share code, so the link exists as soon as the video does.
// Body: { path, filename?, allowDownload? } — the version is named after its file; Allow download
// is on unless the dialog turned it off (D497).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withTryCatch("Could not save the cut.", () =>
    logClientReviewErrors("finalize", req, () => withNode(req, params, async (nodeId, node, caller, clientId) => {
      if (node.type !== "client-review") return apiError("Node not found.", 404);
      const body = (await req.json().catch(() => null)) as
        | { path?: unknown; filename?: unknown; allowDownload?: unknown }
        | null;
      if (typeof body?.path !== "string" || !body.path) {
        return apiError("path is required.", 400);
      }
      if (body.allowDownload !== undefined && typeof body.allowDownload !== "boolean") {
        return apiError("allowDownload must be true or false.", 400);
      }
      // A client could otherwise finalize with an arbitrary path and point the
      // public link at someone else's object.
      const prefix = clientReviewPrefix({ clientId, canvasId: node.canvas_id, nodeId });
      if (!isCutPathFor(prefix, body.path)) {
        return apiError("Upload path does not belong to this node.", 400);
      }
      const review =
        (await getReviewByNodeId(nodeId)) ??
        (await ensureReview({ canvasId: node.canvas_id, nodeId, createdBy: caller.userId }));
      await createVersion({
        reviewId: review.id,
        videoPath: body.path,
        // The version is named after its file, as the node used to be (the uploader sends it).
        title: typeof body.filename === "string" ? titleFromFilename(body.filename).slice(0, 200) || null : null,
        allowDownload: body.allowDownload ?? true,
        createdBy: caller.userId,
      });
      return apiOk(await clientReviewPayload(review), 201);
    })),
  );
}
