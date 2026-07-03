"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  updateKBVersionOutput,
  deleteKBDocument,
  deleteBrandImage,
  listKBDocuments,
  listBrandImages,
} from "@/lib/db/kb";
import { setKBStatus, getClientById } from "@/lib/db/clients";
import { setNestedField } from "@/lib/kb/utils";
import { computeReadyStatus } from "@/lib/kb/fill-rate";
import type { TraceableBrandKB } from "@/lib/kb/schema";
import { removeObject } from "@/lib/storage";
import { tasks } from "@trigger.dev/sdk/v3";
import {
  insertKBJob,
  setKBJobTriggerRunId,
  markKBJobStuckIfRunning,
  getKBJob,
} from "@/lib/db/kb-jobs";

// ── Field Patch ───────────────────────────────────────────────────────────────
// Replaces PATCH /api/clients/:id/kb/field
export async function patchKBFieldAction(
  versionId: string,
  path: string[],
  patch: Record<string, unknown>,
): Promise<void> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("client_kb_versions")
    .select("output")
    .eq("id", versionId)
    .maybeSingle();

  if (error || !data) throw new Error("Version not found");

  const updated = setNestedField(
    data.output as Record<string, unknown>,
    path,
    patch,
  ) as unknown as TraceableBrandKB;

  await updateKBVersionOutput(versionId, updated);
}

// ── Bulk Save ─────────────────────────────────────────────────────────────────
// Persists the whole reviewed KB output in one write. Mirrors the Script focus
// view's buffered Save: the client edits a local draft and commits it here once,
// rather than auto-saving every field change.
export async function saveKBOutputAction(
  versionId: string,
  output: TraceableBrandKB,
): Promise<void> {
  await updateKBVersionOutput(versionId, output);
}

// ── Mark KB Ready ─────────────────────────────────────────────────────────────
// Replaces POST /api/clients/:id/kb/ready
export async function markKBReadyAction(
  clientId: string,
  versionId: string,
  clientSlug: string,
): Promise<{ ok: true } | { error: string }> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("client_kb_versions")
    .select("output")
    .eq("id", versionId)
    .maybeSingle();

  if (error || !data) return { error: "Version not found." };

  if (!computeReadyStatus(data.output as TraceableBrandKB)) {
    return { error: "All fields must be reviewed before marking KB ready." };
  }

  await setKBStatus(clientId, "ready");
  revalidatePath(`/clients/${clientSlug}`);
  revalidatePath(`/clients/${clientSlug}/kb`);

  return { ok: true };
}

// ── Delete KB Document ────────────────────────────────────────────────────────
// Replaces DELETE /api/clients/:id/kb/documents?docId=...
// Cleans up Supabase Storage + DB record.
export async function deleteKBDocumentAction(
  clientId: string,
  docId: string,
): Promise<void> {
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
}

// ── Delete Brand Image ────────────────────────────────────────────────────────
// Replaces DELETE /api/clients/:id/kb/images?imageId=...
// Cleans up Supabase Storage + DB record.
export async function deleteBrandImageAction(
  clientId: string,
  imageId: string,
): Promise<void> {
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

  await deleteBrandImage(imageId);
}

// ── KB Build Job ──────────────────────────────────────────────────────────────

export async function startKBBuildJob(clientId: string): Promise<{ jobId: string }> {
  const client = await getClientById(clientId);
  if (!client) throw new Error("Client not found.");

  const [docs, images] = await Promise.all([
    listKBDocuments(clientId),
    listBrandImages(clientId),
  ]);

  if (!client.website_url && docs.length === 0) {
    throw new Error("Add a website URL or upload at least one document.");
  }

  let job;
  try {
    job = await insertKBJob({
      clientId,
      websiteUrl: client.website_url,
      docIdsUsed: docs.map((d) => d.id),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : JSON.stringify(e);
    if (msg.includes("client_kb_jobs_one_running_idx") || msg.includes("23505")) {
      throw new Error("A KB build is already running for this client.");
    }
    throw e;
  }

  const run = await tasks.trigger("kb-build", {
    jobId: job.id,
    clientId,
    websiteUrl: client.website_url,
    docIds: docs.map((d) => d.id),
    imageIds: images.map((i) => i.id),
  });

  await setKBJobTriggerRunId(job.id, run.id);
  revalidatePath(`/clients/${client.slug}/kb`);
  return { jobId: job.id };
}

export async function markStuckJobFailed(jobId: string): Promise<void> {
  const job = await getKBJob(jobId);
  if (!job) throw new Error("Job not found.");
  await markKBJobStuckIfRunning(jobId);
  const client = await getClientById(job.client_id);
  if (client) revalidatePath(`/clients/${client.slug}/kb`);
}
