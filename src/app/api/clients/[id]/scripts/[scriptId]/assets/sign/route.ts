import { z } from "zod";
import { apiError, apiOk, withClient } from "@/lib/api/route-helpers";
import { signScriptAssetUpload } from "@/lib/storage";
import { SCRIPT_IMAGE_EXTENSIONS, SCRIPT_IMAGE_MAX_BYTES, SCRIPT_IMAGE_MAX_LABEL } from "@/lib/scripts/constants";

type Ctx = { params: Promise<{ id: string; scriptId: string }> };

const Body = z.object({
  filename: z.string().min(1),
  contentType: z.string().optional(),
  size: z.number().nonnegative(),
  kind: z.enum(["products", "locations"]),
});

// POST /api/clients/:id/scripts/:scriptId/assets/sign — D446: a signed URL for one product image or
// location picture, uploaded straight from the browser to storage (rule 8: bytes never pass through
// the app). The upload is recorded by .../assets/uploaded once it lands.
export async function POST(req: Request, { params }: Ctx) {
  const { scriptId } = await params;
  return withClient(req, params, async (clientId) => {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return apiError("Invalid request body.", 400);
    const { filename, contentType, size, kind } = parsed.data;

    const ext = filename.split(".").pop()?.toLowerCase() ?? "";
    if (!SCRIPT_IMAGE_EXTENSIONS.has(ext)) {
      return apiError(`Use a ${[...SCRIPT_IMAGE_EXTENSIONS].join(", ")} picture.`, 400);
    }
    if (size > SCRIPT_IMAGE_MAX_BYTES) return apiError(`Pictures can be up to ${SCRIPT_IMAGE_MAX_LABEL}.`, 400);

    const { signedUrl, path, url } = await signScriptAssetUpload({
      clientId, scriptId, kind, ext, contentType: contentType || "application/octet-stream",
    });
    return apiOk({ signedUrl, path, url });
  });
}
