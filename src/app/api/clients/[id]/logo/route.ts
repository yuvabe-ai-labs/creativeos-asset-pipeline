import { updateClientLogoUrl } from "@/lib/db/clients";
import {
  apiOk,
  withClient,
  withTryCatch,
  parseFormFile,
  validateFileExtension,
  isApiError,
} from "@/lib/api/route-helpers";
import { uploadClientLogo } from "@/lib/storage";
import { LOGO_EXTENSIONS } from "@/lib/clients/constants";

// POST /api/clients/:id/logo — upload client logo to GCS.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withClient(req, params, async (clientId) => {
    return withTryCatch("Logo upload failed", async () => {
      const fileResult = await parseFormFile(req);
      if (isApiError(fileResult)) return fileResult;
      const { file } = fileResult;

      const extResult = validateFileExtension(file, LOGO_EXTENSIONS);
      if (isApiError(extResult)) return extResult;

      const { url } = await uploadClientLogo({
        clientId,
        filename: file.name,
        body: await file.arrayBuffer(),
        contentType: file.type,
      });

      await updateClientLogoUrl(clientId, url);
      return apiOk({ logoUrl: url });
    });
  });
}
