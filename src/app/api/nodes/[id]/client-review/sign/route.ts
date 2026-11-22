import { logClientReviewErrors } from "@/lib/client-review/log";
import { apiError, apiOk, withNode, withTryCatch, validateFileSize } from "@/lib/api/route-helpers";
import { CUT_EXTENSIONS, CUT_MAX_BYTES } from "@/lib/client-review/constants";
import { cutExtension } from "@/lib/client-review/validate";
import { signClientReviewUpload } from "@/lib/storage";

// POST /api/nodes/:id/client-review/sign — authorize a direct browser → GCS upload of
// a cut into the node (D309). Every upload is a new version (D495); each gets its own object path.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withTryCatch("Could not authorize upload.", () =>
    logClientReviewErrors("sign", req, () => withNode(req, params, async (nodeId, node, _caller, clientId) => {
      const body = (await req.json().catch(() => null)) as {
        filename?: string;
        contentType?: string;
        size?: number;
      } | null;
      if (node.type !== "client-review") return apiError("Node not found.", 404);
      if (
        !body?.filename ||
        typeof body.size !== "number" ||
        !Number.isFinite(body.size) ||
        body.size <= 0
      ) {
        return apiError("filename and a positive size are required.", 400);
      }
      if (typeof body.contentType !== "string" || !body.contentType.startsWith("video/")) {
        return apiError("Upload a video file.", 400);
      }
      const ext = cutExtension(body.filename);
      if (!ext) {
        return apiError(`Upload a video: ${[...CUT_EXTENSIONS].map((e) => `.${e}`).join(", ")}.`, 400);
      }
      const sizeError = validateFileSize(body.size, 0, CUT_MAX_BYTES, "500 MB");
      if (sizeError) return sizeError;
      const signed = await signClientReviewUpload({
        clientId,
        canvasId: node.canvas_id,
        nodeId,
        ext,
        contentType: body.contentType,
      });
      return apiOk(signed);
    })),
  );
}
