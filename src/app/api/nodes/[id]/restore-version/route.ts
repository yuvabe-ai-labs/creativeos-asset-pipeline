import { createServerSupabase } from "@/lib/supabase/server";
import { setActiveVersion } from "@/lib/db/versions";
import { apiError, apiOk, withTryCatch, withNode } from "@/lib/api/route-helpers";

// POST /api/nodes/:id/restore-version — move the active-version pointer to a
// previous version and return its output so the client can update the canvas.
//
// Also returns the model and params that version was generated with (YUV-295). Restoring used
// to hand back the output alone, so the node kept whatever settings happened to be on it — a
// v1 clip sitting under v3's model and duration, with nothing to say the two disagreed. The
// video-gen and image-gen views both apply these now; both fields are additive, so the prompt
// and video-prompt views calling this same route read `output` only and are unaffected.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withNode(req, params, async (nodeId) => {
    const body = (await req.json().catch(() => null)) as { versionId?: unknown } | null;
    const versionId = typeof body?.versionId === "string" ? body.versionId : null;
    if (!versionId) return apiError("versionId required.", 400);

    return withTryCatch("Restore failed.", async () => {
      const supabase = createServerSupabase();
      const { data: version, error } = await supabase
        .from("node_versions")
        .select("id, output, model_used, params_used")
        .eq("id", versionId)
        .eq("node_id", nodeId)
        .single();
      if (error || !version) return apiError("Version not found.", 404);

      await setActiveVersion(nodeId, versionId);

      const v = version as {
        id: string;
        output: unknown;
        model_used: unknown;
        params_used: unknown;
      };
      return apiOk({
        output: typeof v.output === "string" ? v.output : null,
        modelUsed: typeof v.model_used === "string" ? v.model_used : null,
        paramsUsed: (v.params_used ?? {}) as Record<string, unknown>,
      });
    });
  });
}
