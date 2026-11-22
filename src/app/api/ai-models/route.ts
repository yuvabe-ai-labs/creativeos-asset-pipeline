import { apiError, apiOk } from "@/lib/api/route-helpers";
import { resolveCallerContextOrNull } from "@/lib/dal";
import { getAiCatalog } from "@/lib/ai-models/catalog";

export const dynamic = "force-dynamic";

// D529 — the catalog for the browser: every model a signed-in user can see (draft models are
// the super admin's alone) with their prices. One request per session (useAiCatalog), never
// one per node.
export async function GET() {
  try {
    const caller = await resolveCallerContextOrNull();
    if (!caller) return apiError("Unauthorized.", 401);
    const catalog = await getAiCatalog();
    const models = catalog.models.filter((m) => m.status !== "draft");
    const ids = new Set(models.map((m) => m.id));
    return apiOk({ catalog: { models, prices: catalog.prices.filter((p) => ids.has(p.modelId)) } });
  } catch (e) {
    console.error("[GET /api/ai-models] catalog read failed", e);
    return apiError("Could not load the models.", 500);
  }
}
