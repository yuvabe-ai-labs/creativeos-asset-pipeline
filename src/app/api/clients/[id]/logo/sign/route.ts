import { LOGO_EXTENSIONS } from "@/lib/clients/constants";
import { apiError, apiOk, withClient } from "@/lib/api/route-helpers";
import { signClientLogoUpload } from "@/lib/storage";

// POST /api/clients/:id/logo/sign — validate metadata and return a signed URL for a
// direct browser → GCS upload of a client logo.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withClient(params, async (clientId) => {
    const body = (await req.json().catch(() => null)) as {
      filename?: string;
      contentType?: string;
    } | null;
    if (!body?.filename) {
      return apiError("filename is required.", 400);
    }

    const ext = body.filename.split(".").pop()?.toLowerCase() ?? "";
    if (!LOGO_EXTENSIONS.has(ext)) {
      return apiError(
        `Unsupported file type '.${ext}'. Allowed: ${[...LOGO_EXTENSIONS].join(", ")}.`,
        400,
      );
    }

    const { signedUrl, path, url } = await signClientLogoUpload({
      clientId,
      filename: body.filename,
      contentType: body.contentType || "application/octet-stream",
    });
    return apiOk({ signedUrl, path, url });
  });
}
