import { apiOk, withClient, withQuietErrors } from "@/lib/api/route-helpers";
import { resolveCallerContextOrNull } from "@/lib/dal";
import { getActiveKBVersion } from "@/lib/db/kb";
import { getImageAnalysisStatus, startImageAnalysis } from "@/lib/image-analysis/start";
import type { TraceableBrandKB } from "@/lib/kb/schema";

async function statusWithSection(clientId: string) {
  const [status, version] = await Promise.all([getImageAnalysisStatus(clientId), getActiveKBVersion(clientId)]);
  return {
    ...status,
    // The section as stored, so the review screen can take a finished run's result without a reload.
    versionId: version?.id ?? null,
    imageAnalysis: (version?.output as TraceableBrandKB | undefined)?.image_analysis ?? null,
  };
}

// GET /api/clients/:id/image-analysis — how many images are read, the latest run, and the
// Image Analysis section it wrote (D312). Polled while a run is going.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withClient(req, params, async (clientId) =>
    withQuietErrors("Couldn't load the image analysis. Try again.", async () => apiOk(await statusWithSection(clientId))),
  );
}

// POST /api/clients/:id/image-analysis — read any images without a card and rewrite the section.
// Returns at once; the run is in the background.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withClient(req, params, async (clientId) =>
    withQuietErrors("Couldn't start the image analysis. Try again.", async () => {
      const caller = await resolveCallerContextOrNull();
      await startImageAnalysis(clientId, caller?.userId ?? null);
      return apiOk(await statusWithSection(clientId));
    }),
  );
}
