"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  updateKBVersionOutput,
  deleteKBDocument,
  deleteBrandImage,
} from "@/lib/db/kb";
import { setKBStatus } from "@/lib/db/clients";
import { setNestedField } from "@/lib/kb/utils";
import { computeReadyStatus } from "@/lib/kb/fill-rate";
import type { TraceableBrandKB } from "@/lib/kb/schema";

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

  const storageUrl: string = data.storage_url;
  const bucketMarker = "/kb-documents/";
  const pathStart = storageUrl.indexOf(bucketMarker);
  if (pathStart !== -1) {
    const storagePath = storageUrl.slice(pathStart + bucketMarker.length);
    await supabase.storage.from("kb-documents").remove([storagePath]);
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

  const storageUrl: string = data.storage_url;
  const bucketMarker = "/client-brand-images/";
  const pathStart = storageUrl.indexOf(bucketMarker);
  if (pathStart !== -1) {
    const storagePath = storageUrl.slice(pathStart + bucketMarker.length);
    await supabase.storage.from("client-brand-images").remove([storagePath]);
  }

  await deleteBrandImage(imageId);
}

