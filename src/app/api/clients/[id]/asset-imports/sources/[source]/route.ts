import { apiError, apiOk, withClient, withQuietErrors } from "@/lib/api/route-helpers";
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
  return withClient(req, params, { need: "brand_assets.edit" }, async (clientId, _client, caller) =>
    withQuietErrors("Couldn't save that. Try again.", async () => {
      if (!IMPORT_SOURCES.includes(source as ImportSource)) return apiError("Unknown source.", 404);
      const body = (await req.json().catch(() => null)) as { value?: unknown } | null;
      if (typeof body?.value !== "string") return apiError("Enter a handle or link.", 400);
      if (body.value.length > MAX_TARGET_LENGTH) return apiError("That's too long for a handle or link.", 400);

      let targets;
      try {
        targets = await setImportTarget(clientId, source as ImportSource, body.value);
      } catch (e) {
        if (e instanceof ImportTargetError) return apiError(e.message, 400);
        throw e;
      }
      // A connected source imports at once; a disconnected one has nothing to import.
      const imports = targets[source as ImportSource]
        ? await startAssetImports({ clientId, sources: [source as ImportSource], userId: caller.userId })
        : undefined;
      return apiOk({ targets, imports });
    }),
  );
}
