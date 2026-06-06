import { createServerSupabase } from "@/lib/supabase/server";
import { updateClientLogoUrl } from "@/lib/db/clients";
import {
  apiError,
  apiOk,
  withClient,
  withTryCatch,
  parseFormFile,
  validateFileExtension,
  isApiError,
} from "@/lib/api/route-helpers";

// svg and gif are allowed for logos beyond the standard IMG_EXTENSIONS set
const LOGO_EXTENSIONS = new Set(["png", "svg", "jpg", "jpeg", "webp", "gif"]);

// POST /api/clients/:id/logo — upload client logo to Supabase Storage.
// Called from the new-client dialog after the client row is created.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withClient(params, async (clientId) => {
    return withTryCatch("Logo upload failed", async () => {
      const fileResult = await parseFormFile(req);
      if (isApiError(fileResult)) return fileResult;
      const { file } = fileResult;

      const extResult = validateFileExtension(file, LOGO_EXTENSIONS);
      if (isApiError(extResult)) return extResult;

      const supabase = createServerSupabase();
      const storagePath = `${clientId}/${file.name}`;
      const arrayBuffer = await file.arrayBuffer();

      const { error: uploadError } = await supabase.storage
        .from("client-logos")
        .upload(storagePath, arrayBuffer, {
          contentType: file.type,
          upsert: true,
        });

      if (uploadError) {
        return apiError(`Logo upload failed: ${uploadError.message}`, 500);
      }

      const { data: publicData } = supabase.storage
        .from("client-logos")
        .getPublicUrl(storagePath);

      await updateClientLogoUrl(clientId, publicData.publicUrl);

      return apiOk({ logoUrl: publicData.publicUrl });
    });
  });
}
