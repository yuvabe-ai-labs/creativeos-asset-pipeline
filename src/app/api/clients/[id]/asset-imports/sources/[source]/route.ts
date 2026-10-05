import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { resolveCallerContextOrNull } from "@/lib/dal";
import { IMPORT_SOURCES, type ImportSource } from "@/lib/asset-import/constants";
import { ImportTargetError, setImportTarget, startAssetImports } from "@/lib/asset-import/start";

const MAX_TARGET_LENGTH = 300;

// PUT /api/clients/:id/asset-imports/sources/:source — set where one source imports from, then
// import it (D302). Body `{ value: string }`: a handle or link; blank disconnects the source.
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string; source: string }> },
) {
  const { source } = await params;
  return withClient(req, params, async (clientId) =>
    withTryCatch("Could not save the source.", async () => {
      if (!IMPORT_SOURCES.includes(source as ImportSource)) return apiError("Unknown source.", 404);
      const body = (await req.json().catch(() => null)) as { value?: unknown } | null;
      if (typeof body?.value !== "string") return apiError("value must be a string.", 400);
      if (body.value.length > MAX_TARGET_LENGTH) return apiError("That is too long.", 400);

      let targets;
      try {
        targets = await setImportTarget(clientId, source as ImportSource, body.value);
      } catch (e) {
        if (e instanceof ImportTargetError) return apiError(e.message, 400);
        throw e;
      }
      // A connected source imports at once; a disconnected one has nothing to import.
      const caller = await resolveCallerContextOrNull();
      const imports = targets[source as ImportSource]
        ? await startAssetImports({ clientId, sources: [source as ImportSource], userId: caller?.userId ?? null })
        : undefined;
      return apiOk({ targets, imports });
    }),
  );
}
