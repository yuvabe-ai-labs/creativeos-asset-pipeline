import { apiError, apiOk } from "@/lib/api/route-helpers";
import { resolveCallerContextOrNull } from "@/lib/dal";
import { getAiCatalog } from "@/lib/ai-models/catalog";
import { browserCatalog } from "@/lib/ai-models/browser-catalog";

export const dynamic = "force-dynamic";

// D552 — the catalog for the browser (browserCatalog). One request per session (useAiCatalog),
// never one per node.
export async function GET() {
  try {
    const caller = await resolveCallerContextOrNull();
    if (!caller) return apiError("Unauthorized.", 401);
    return apiOk({ catalog: browserCatalog(await getAiCatalog()) });
  } catch (e) {
    console.error("[GET /api/ai-models] catalog read failed", e);
    return apiError("Could not load the models.", 500);
  }
}
