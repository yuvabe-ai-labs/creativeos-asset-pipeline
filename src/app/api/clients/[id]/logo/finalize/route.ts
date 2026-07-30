import { updateClientLogoUrl } from "@/lib/db/clients";
import { LOGO_EXTENSIONS } from "@/lib/clients/constants";
import { apiError, apiOk, withClient } from "@/lib/api/route-helpers";
import { publicUrlFor } from "@/lib/storage/gcs";

// POST /api/clients/:id/logo/finalize — record a client logo already uploaded
// directly to GCS (via a signed URL) as the client's logo URL.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withClient(params, async (clientId) => {
    const body = (await req.json().catch(() => null)) as {
      path?: string;
      filename?: string;
    } | null;
    if (!body?.path || !body.filename) {
      return apiError("path and filename are required.", 400);
    }

    const ext = body.filename.split(".").pop()?.toLowerCase() ?? "";
    if (!LOGO_EXTENSIONS.has(ext)) {
      return apiError(`Unsupported file type '.${ext}'.`, 400);
    }

    // Ensure the uploaded object belongs to this client's logo folder.
    if (!body.path.startsWith(`clients/${clientId}/logo/`)) {
      return apiError("Upload path does not belong to this client.", 400);
    }

    const logoUrl = publicUrlFor(body.path);
    await updateClientLogoUrl(clientId, logoUrl);
    return apiOk({ logoUrl });
  });
}
