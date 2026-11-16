"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  setKBField,
  deleteKBDocument,
  deleteBrandImage,
  listBrandImages,
} from "@/lib/db/kb";
import { getClientById } from "@/lib/db/clients";
import { resolveCallerContext, resolveOrgId } from "@/lib/dal";
import { approveKB } from "@/lib/kb/approve";
import { removeObject } from "@/lib/storage";
import {
  markKBJobStuckIfRunning,
  getKBJob,
} from "@/lib/db/kb-jobs";
import { withAction } from "@/lib/actions/with-action";
import { startImageAnalysisQuietly } from "@/lib/image-analysis/start";
import { startKBBuild } from "@/lib/kb/start-build";

// ── Field Patch ───────────────────────────────────────────────────────────────
// Replaces PATCH /api/clients/:id/kb/field
export async function patchKBFieldAction(
  versionId: string,
  path: string[],
  patch: Record<string, unknown>,
): Promise<void> {
  return withAction("patchKBFieldAction", async () => {
    const supabase = createServerSupabase();
    const { data, error } = await supabase
      .from("client_kb_versions")
      .select("output")
      .eq("id", versionId)
      .maybeSingle();

    if (error || !data) throw new Error("Version not found");

    let field: unknown = data.output;
    for (const key of path) field = (field as Record<string, unknown> | undefined)?.[key];
    // One field in one statement, so a background write elsewhere in the KB is never undone (D318).
    await setKBField(versionId, path, { ...(field as Record<string, unknown> | undefined), ...patch });
  });
}

// ── Mark KB Ready ─────────────────────────────────────────────────────────────
// Replaces POST /api/clients/:id/kb/ready
export async function markKBReadyAction(
  clientId: string,
  versionId: string,
  clientSlug: string,
): Promise<{ ok: true } | { error: string }> {
  return withAction("markKBReadyAction", async () => {
    // The client id comes from the browser: it must be one the caller may open.
    const [client, orgId, { userId }] = await Promise.all([getClientById(clientId), resolveOrgId(), resolveCallerContext()]);
    if (!client || client.org_id !== orgId || client.slug !== clientSlug) return { error: "Client not found." };
    // The same approval the copilot's gate card reaches (src/lib/kb/approve.ts).
    return approveKB({ client, userId, versionId });
  });
}

// ── Delete KB Document ────────────────────────────────────────────────────────
// Replaces DELETE /api/clients/:id/kb/documents?docId=...
// Cleans up Supabase Storage + DB record.
export async function deleteKBDocumentAction(
  clientId: string,
  docId: string,
): Promise<void> {
  return withAction("deleteKBDocumentAction", async () => {
    const supabase = createServerSupabase();
    const { data, error } = await supabase
      .from("client_kb_documents")
      .select("storage_url, client_id")
      .eq("id", docId)
      .maybeSingle();

    if (error) throw error;
    if (!data || data.client_id !== clientId) throw new Error("Document not found");

    try {
      await removeObject(data.storage_url);
    } catch {
      // Best-effort cleanup — proceed with DB delete regardless
    }

    await deleteKBDocument(docId);
  });
}

// ── Delete Brand Image ────────────────────────────────────────────────────────
// Replaces DELETE /api/clients/:id/kb/images?imageId=...
// Cleans up Supabase Storage + DB record.
export async function deleteBrandImageAction(
  clientId: string,
  imageId: string,
): Promise<void> {
  return withAction("deleteBrandImageAction", async () => {
    const supabase = createServerSupabase();
    const { data, error } = await supabase
      .from("client_brand_images")
      .select("storage_url, client_id")
      .eq("id", imageId)
      .maybeSingle();

    if (error) throw error;
    if (!data || data.client_id !== clientId) throw new Error("Image not found");

    try {
      await removeObject(data.storage_url);
    } catch {
      // Best-effort cleanup
    }

    await deleteBrandImage(clientId, imageId);
    // The analysis no longer matches the images: rebuild it without this one.
    await startImageAnalysisQuietly(clientId);
  });
}

// ── KB Build Job ──────────────────────────────────────────────────────────────

export async function startKBBuildJob(clientId: string): Promise<{ jobId: string }> {
  // The same start the brand KB copilot uses (src/lib/kb/start-build.ts), so both behave alike.
  return withAction("startKBBuildJob", () => startKBBuild(clientId));
}

export async function markStuckJobFailed(jobId: string): Promise<void> {
  return withAction("markStuckJobFailed", async () => {
    const job = await getKBJob(jobId);
    if (!job) throw new Error("Job not found.");
    await markKBJobStuckIfRunning(jobId);
    const client = await getClientById(job.client_id);
    if (client) revalidatePath(`/clients/${client.slug}/kb`);
  });
}
