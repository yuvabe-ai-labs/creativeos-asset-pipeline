import { insertBrandImage } from "@/lib/db/kb";
import { IMG_EXTENSIONS } from "@/lib/kb/constants";
import { apiError, apiOk, withClient } from "@/lib/api/route-helpers";
import { publicUrlFor } from "@/lib/storage/gcs";

// POST /api/clients/:id/kb/images/finalize — record a brand image already uploaded
// directly to GCS (via a signed URL) in the database.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withClient(req, params, async (clientId) => {
    const body = (await req.json().catch(() => null)) as {
      path?: string;
      filename?: string;
      size?: number;
    } | null;
    if (!body?.path || !body.filename || typeof body.size !== "number") {
      return apiError("path, filename and size are required.", 400);
    }

    const ext = body.filename.split(".").pop()?.toLowerCase() ?? "";
    if (!IMG_EXTENSIONS.has(ext)) {
      return apiError(`Unsupported file type '.${ext}'.`, 400);
    }

    // Ensure the uploaded object belongs to this client's brand images.
    if (!body.path.startsWith(`clients/${clientId}/brand-images/`)) {
      return apiError("Upload path does not belong to this client.", 400);
    }

    const image = await insertBrandImage({
      clientId,
      filename: body.filename,
      fileExt: ext,
      storageUrl: publicUrlFor(body.path),
      sizeBytes: body.size,
    });

    return apiOk({ image });
  });
}
