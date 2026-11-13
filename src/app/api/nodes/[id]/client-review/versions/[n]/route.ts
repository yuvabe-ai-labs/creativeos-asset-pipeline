import { logClientReviewErrors } from "@/lib/client-review/log";
import { apiError, apiOk, withNode, withTryCatch } from "@/lib/api/route-helpers";
import { toReviewVersion } from "@/lib/client-review/wire";
import { getReviewByNodeId, updateVersion } from "@/lib/db/client-reviews";
import { normalizeTitle } from "@/lib/nodes/title";
import { publicUrlFor } from "@/lib/storage";

const TITLE_MAX = 200;

// PATCH /api/nodes/:id/client-review/versions/:n — change one version: its Allow download switch
// (D497) and/or its title. Body: { allowDownload?: boolean, title?: string }. Download takes effect
// at once on the server; an open client page shows the change on its next load.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; n: string }> }) {
  const { n } = await params;
  const versionNo = Number(n);
  if (!Number.isInteger(versionNo) || versionNo < 1) return apiError("Version not found.", 404);
  return withTryCatch("Could not change the version.", () =>
    logClientReviewErrors("version-update", req, () => withNode(req, params, async (nodeId, node) => {
      if (node.type !== "client-review") return apiError("Node not found.", 404);
      const body = (await req.json().catch(() => null)) as { allowDownload?: unknown; title?: unknown } | null;
      if (body?.allowDownload !== undefined && typeof body.allowDownload !== "boolean") {
        return apiError("allowDownload must be true or false.", 400);
      }
      if (body?.title !== undefined && typeof body.title !== "string") {
        return apiError("title must be text.", 400);
      }
      const title = typeof body?.title === "string" ? normalizeTitle(body.title) : undefined;
      if (title !== undefined && (!title || title.length > TITLE_MAX)) {
        return apiError(`A title is 1 to ${TITLE_MAX} characters.`, 400);
      }
      const allowDownload = body?.allowDownload as boolean | undefined;
      if (allowDownload === undefined && title === undefined) {
        return apiError("Nothing to change.", 400);
      }
      const review = await getReviewByNodeId(nodeId);
      if (!review) return apiError("Version not found.", 404);
      const row = await updateVersion(review.id, versionNo, { allowDownload, title });
      if (!row) return apiError("Version not found.", 404);
      return apiOk({ version: toReviewVersion(row, publicUrlFor(row.video_path)) });
    })),
  );
}
