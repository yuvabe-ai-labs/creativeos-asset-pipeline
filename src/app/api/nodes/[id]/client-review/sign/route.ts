import { apiError, apiOk, withNode, withTryCatch, validateFileSize } from "@/lib/api/route-helpers";
import { CUT_EXTENSIONS, CUT_MAX_BYTES } from "@/lib/client-review/constants";
import { cutExtension } from "@/lib/client-review/validate";
import { getReviewByNodeId } from "@/lib/db/client-reviews";
import { signClientReviewUpload } from "@/lib/storage";

// POST /api/nodes/:id/client-review/sign — authorize a direct browser → GCS upload of
// the node's cut (D279). One cut per node: a node that already has one gets 409.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withTryCatch("Could not authorize upload.", () =>
    withNode(req, params, async (nodeId, node, _caller, clientId) => {
      const body = (await req.json().catch(() => null)) as {
        filename?: string;
        contentType?: string;
        size?: number;
      } | null;
      if (!body?.filename || typeof body.size !== "number") {
        return apiError("filename and size are required.", 400);
      }
      const ext = cutExtension(body.filename);
      if (!ext) {
        return apiError(`Upload a video: ${[...CUT_EXTENSIONS].map((e) => `.${e}`).join(", ")}.`, 400);
      }
      const sizeError = validateFileSize(body.size, 0, CUT_MAX_BYTES, "500 MB");
      if (sizeError) return sizeError;
      if (await getReviewByNodeId(nodeId)) {
        return apiError("This node already has a cut. Add a new Client review node for a new cut.", 409);
      }
      const signed = await signClientReviewUpload({
        clientId,
        canvasId: node.canvas_id,
        nodeId,
        ext,
        contentType: body.contentType || `video/${ext === "mov" ? "quicktime" : ext}`,
      });
      return apiOk(signed);
    }),
  );
}
