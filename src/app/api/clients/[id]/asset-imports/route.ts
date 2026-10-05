import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { countImportedBrandImages } from "@/lib/db/kb";
import { resolveCallerContextOrNull } from "@/lib/dal";
import { IMPORT_SOURCES, type ImportSource } from "@/lib/asset-import/constants";
import { listImportTargets, listLatestAssetImports, startAssetImports } from "@/lib/asset-import/start";

// GET /api/clients/:id/asset-imports — each source's latest import, where each source imports
// from, and how many assets there are (D302). Small on purpose: the browser polls it while an import runs. The assets themselves are
// paged from ./assets.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withClient(req, params, async (clientId) =>
    withTryCatch("Could not load the imported assets.", async () => {
      const [imports, counts, targets] = await Promise.all([
        listLatestAssetImports(clientId),
        countImportedBrandImages(clientId),
        listImportTargets(clientId),
      ]);
      return apiOk({ imports, counts, targets });
    }),
  );
}

// POST /api/clients/:id/asset-imports — start importing. Body `{ sources?: [...] }`; all sources
// with a saved target when omitted. Returns at once; the scrapes run in the background.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withClient(req, params, async (clientId) =>
    withTryCatch("Could not start the import.", async () => {
      const body = (await req.json().catch(() => ({}))) as { sources?: unknown };
      let sources: ImportSource[] | undefined;
      if (body.sources !== undefined) {
        if (!Array.isArray(body.sources) || !body.sources.every((s) => IMPORT_SOURCES.includes(s))) {
          return apiError("sources must be a list of website, instagram, facebook.", 400);
        }
        sources = body.sources as ImportSource[];
      }
      const caller = await resolveCallerContextOrNull();
      const imports = await startAssetImports({ clientId, sources, userId: caller?.userId ?? null });
      return apiOk({ imports });
    }),
  );
}
