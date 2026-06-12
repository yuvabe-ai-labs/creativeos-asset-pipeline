import { createServerSupabase } from "@/lib/supabase/server";
import { setActiveVersion } from "@/lib/db/versions";
import { apiError, apiOk, withTryCatch } from "@/lib/api/route-helpers";

// POST /api/nodes/:id/restore-version — move the active-version pointer to a
// previous version and return its output so the client can update the canvas.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: nodeId } = await params;
  const body = (await req.json().catch(() => null)) as { versionId?: unknown } | null;
  const versionId = typeof body?.versionId === "string" ? body.versionId : null;
  if (!versionId) return apiError("versionId required.", 400);

  return withTryCatch("Restore failed.", async () => {
    const supabase = createServerSupabase();
    const { data: version, error } = await supabase
      .from("node_versions")
      .select("id, output")
      .eq("id", versionId)
      .eq("node_id", nodeId)
      .single();
    if (error || !version) return apiError("Version not found.", 404);

    await setActiveVersion(nodeId, versionId);

    const v = version as { id: string; output: unknown };
    return apiOk({ output: typeof v.output === "string" ? v.output : null });
  });
}
