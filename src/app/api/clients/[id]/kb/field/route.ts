import { createServerSupabase } from "@/lib/supabase/server";
import { updateKBVersionOutput } from "@/lib/db/kb";
import { setNestedField } from "@/lib/kb/utils";
import type { TraceableBrandKB } from "@/lib/kb/schema";
import { apiError, apiOk, withTryCatch } from "@/lib/api/route-helpers";

// PATCH /api/clients/:id/kb/field
// Applies a surgical patch to a single KBField within the active KB version.
// Body: { versionId, path: string[], patch: { status?, value?, … } }
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await params; // clientId not needed — versionId scopes the update

  return withTryCatch("Field update failed", async () => {
    const body = await req.json() as {
      versionId: string;
      path: string[];
      patch: Record<string, unknown>;
    };
    const { versionId, path, patch } = body;

    if (!versionId || !Array.isArray(path) || path.length === 0 || !patch) {
      return apiError("Missing required fields.", 400);
    }

    const supabase = createServerSupabase();
    const { data, error } = await supabase
      .from("client_kb_versions")
      .select("output")
      .eq("id", versionId)
      .maybeSingle();

    if (error) return apiError(error.message, 500);
    if (!data) return apiError("Version not found.", 404);

    const updated = setNestedField(
      data.output as Record<string, unknown>,
      path,
      patch,
    ) as unknown as TraceableBrandKB;

    await updateKBVersionOutput(versionId, updated);

    return apiOk({ ok: true as const });
  });
}
