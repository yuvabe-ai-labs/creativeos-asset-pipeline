import { getActiveKBVersion, listKBDocuments } from "@/lib/db/kb";
import { apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";

// GET /api/clients/:id/kb/active — returns active KB version meta + documents list.
// Used by the KB node's sheet.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withClient(params, async (clientId) => {
    return withTryCatch("Failed to fetch KB data", async () => {
      const [version, documents] = await Promise.all([
        getActiveKBVersion(clientId),
        listKBDocuments(clientId),
      ]);

      return apiOk({
        version: version
          ? {
              id: version.id,
              fillRate: version.fill_rate,
              createdAt: version.created_at,
              modelUsed: version.model_used,
              docIdsUsed: version.doc_ids_used,
            }
          : null,
        documents: documents.map((d) => ({
          id: d.id,
          filename: d.filename,
          fileExt: d.file_ext,
          sizeBytes: d.size_bytes,
          createdAt: d.created_at,
        })),
      });
    });
  });
}
