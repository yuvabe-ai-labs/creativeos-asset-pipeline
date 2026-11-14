import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { setKBStatus } from "@/lib/db/clients";
import { computeReadyStatus } from "@/lib/kb/fill-rate";
import type { TraceableBrandKB } from "@/lib/kb/schema";
import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";

// POST /api/clients/:id/kb/ready
// Verifies all fields are reviewed server-side, then marks the KB ready.
// Body: { versionId }
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withClient(req, params, { need: "edit" }, async (clientId, client) => {
    return withTryCatch("Failed to mark KB ready", async () => {
      const { versionId } = await req.json() as { versionId: string };
      if (!versionId) return apiError("Missing versionId.", 400);

      // The version id comes from the body: it must be this client's version (as markKBReadyAction
      // checks), or another client's reviewed version would mark this brand kit ready.
      const supabase = createServerSupabase();
      const { data, error } = await supabase
        .from("client_kb_versions")
        .select("output")
        .eq("id", versionId)
        .eq("client_id", clientId)
        .maybeSingle();

      if (error) throw error;
      if (!data) return apiError("Version not found.", 404);

      if (!computeReadyStatus(data.output as TraceableBrandKB)) {
        return apiError("All fields must be reviewed before marking KB ready.", 400);
      }

      await setKBStatus(clientId, "ready");
      revalidatePath(`/clients/${client.slug}`);
      revalidatePath(`/clients/${client.slug}/kb`);

      return apiOk({ ok: true as const });
    });
  });
}
