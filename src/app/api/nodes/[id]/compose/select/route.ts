import { getVersionById, updateVersionOutput } from "@/lib/db/versions";
import { apiError, apiOk } from "@/lib/api/route-helpers";

// POST /api/nodes/:id/compose/select — capture the designer's pick (D28). Folds
// { selectedIndex, finalDescription } into the compose row's `output`, leaving
// generated_output frozen (D22). The eval flywheel reads: proposed 4 -> chose #i -> shipped Y.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: nodeId } = await params;
  const body = (await req.json().catch(() => null)) as
    | { versionId?: unknown; selectedIndex?: unknown; finalDescription?: unknown }
    | null;
  const versionId = typeof body?.versionId === "string" ? body.versionId : "";
  const selectedIndex = typeof body?.selectedIndex === "number" ? body.selectedIndex : -1;
  const finalDescription = typeof body?.finalDescription === "string" ? body.finalDescription : "";
  if (!versionId) return apiError("versionId is required.", 400);

  const version = await getVersionById(versionId);
  if (!version || version.node_id !== nodeId) return apiError("Version not found for this node.", 404);

  const gen = (version.generated_output ?? {}) as { ideas?: unknown };
  await updateVersionOutput(versionId, {
    ideas: gen.ideas ?? [],
    selectedIndex,
    finalDescription,
  });

  return apiOk({ ok: true });
}
