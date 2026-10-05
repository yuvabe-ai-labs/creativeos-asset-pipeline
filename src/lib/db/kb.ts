import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { removeObject } from "@/lib/storage";
import type {
  ClientKBDocumentRow,
  ClientKBVersionRow,
  ClientBrandImageRow,
} from "./types";
import type { TraceableBrandKB } from "@/lib/kb/schema";
import type { BrandImageSource } from "@/lib/asset-import/constants";

export { KB_DOC_SIZE_LIMIT_BYTES, KB_IMG_SIZE_LIMIT_BYTES } from "@/lib/kb/constants";

// ── Documents ─────────────────────────────────────────────────────────────────

export async function listKBDocuments(
  clientId: string,
): Promise<ClientKBDocumentRow[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("client_kb_documents")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ClientKBDocumentRow[];
}

export async function insertKBDocument(input: {
  clientId: string;
  filename: string;
  fileExt: string;
  storageUrl: string;
  sizeBytes: number;
}): Promise<ClientKBDocumentRow> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("client_kb_documents")
    .insert({
      client_id: input.clientId,
      filename: input.filename,
      file_ext: input.fileExt,
      storage_url: input.storageUrl,
      size_bytes: input.sizeBytes,
    })
    .select()
    .single();
  if (error) throw error;
  return data as ClientKBDocumentRow;
}

export async function deleteKBDocument(docId: string): Promise<void> {
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from("client_kb_documents")
    .delete()
    .eq("id", docId);
  if (error) throw error;
}

export async function getKBTotalBytes(clientId: string): Promise<number> {
  const docs = await listKBDocuments(clientId);
  return docs.reduce((sum, d) => sum + (d.size_bytes ?? 0), 0);
}

// ── Brand Images ──────────────────────────────────────────────────────────────

/**
 * A client's Brand Images. `uploads` — what the team uploaded, the only rows the KB analyses
 * and the only bytes the upload limit counts (D303). `imported` — scraped from the website and
 * socials (D302), newest post first.
 */
export async function listBrandImages(
  clientId: string,
  which: "all" | "uploads" | "imported" = "all",
): Promise<ClientBrandImageRow[]> {
  const supabase = createServerSupabase();
  let query = supabase.from("client_brand_images").select("*").eq("client_id", clientId);
  if (which === "uploads") query = query.eq("source", "upload");
  if (which === "imported") query = query.neq("source", "upload");
  const { data, error } =
    which === "imported"
      ? await query.order("posted_at", { ascending: false, nullsFirst: false }).order("created_at", { ascending: true })
      : await query.order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ClientBrandImageRow[];
}

/** The dedupe keys a client already holds (D305). */
export async function listBrandImageRefs(clientId: string): Promise<Set<string>> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("client_brand_images")
    .select("source_ref")
    .eq("client_id", clientId)
    .not("source_ref", "is", null);
  if (error) throw error;
  return new Set(((data ?? []) as { source_ref: string }[]).map((r) => r.source_ref));
}

/**
 * Records one imported asset. Returns null when the client already has its ref — another source
 * imported the same cross-post a moment earlier (D305); the unique index decides the race.
 */
export async function insertImportedBrandImage(input: {
  id: string;
  clientId: string;
  source: Exclude<BrandImageSource, "upload">;
  mediaType: "image" | "video";
  filename: string;
  fileExt: string;
  storageUrl: string;
  sizeBytes: number;
  thumbnailUrl: string | null;
  sourceUrl: string | null;
  postedAt: string | null;
  sourceRef: string;
}): Promise<ClientBrandImageRow | null> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("client_brand_images")
    .insert({
      id: input.id,
      client_id: input.clientId,
      source: input.source,
      media_type: input.mediaType,
      filename: input.filename,
      file_ext: input.fileExt,
      storage_url: input.storageUrl,
      size_bytes: input.sizeBytes,
      thumbnail_url: input.thumbnailUrl,
      source_url: input.sourceUrl,
      posted_at: input.postedAt,
      source_ref: input.sourceRef,
    })
    .select()
    .single();
  if (error) {
    if ((error as { code?: string }).code === "23505") return null;
    throw error;
  }
  return data as ClientBrandImageRow;
}

export async function insertBrandImage(input: {
  clientId: string;
  filename: string;
  fileExt: string;
  storageUrl: string;
  sizeBytes: number;
}): Promise<ClientBrandImageRow> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("client_brand_images")
    .insert({
      client_id: input.clientId,
      filename: input.filename,
      file_ext: input.fileExt,
      storage_url: input.storageUrl,
      size_bytes: input.sizeBytes,
    })
    .select()
    .single();
  if (error) throw error;
  return data as ClientBrandImageRow;
}

export async function deleteBrandImage(imageId: string): Promise<void> {
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from("client_brand_images")
    .delete()
    .eq("id", imageId);
  if (error) throw error;
}

/**
 * Removes one imported asset and its stored files. False when there is no such asset, it belongs
 * to another client, or it is an upload (uploads go through the KB source panel's staged removal).
 */
export async function deleteImportedBrandImage(clientId: string, imageId: string): Promise<boolean> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("client_brand_images")
    .select("client_id, source, storage_url, thumbnail_url")
    .eq("id", imageId)
    .maybeSingle();
  if (error) throw error;
  const row = data as Pick<ClientBrandImageRow, "client_id" | "source" | "storage_url" | "thumbnail_url"> | null;
  if (!row || row.client_id !== clientId || row.source === "upload") return false;

  for (const url of [row.storage_url, row.thumbnail_url]) {
    if (url) await removeObject(url).catch(() => {}); // best-effort, as the upload path does
  }
  await deleteBrandImage(imageId);
  return true;
}

/** Bytes counted against the upload limit — uploads only; imports never block an upload (D303). */
export async function getBrandImageTotalBytes(clientId: string): Promise<number> {
  const images = await listBrandImages(clientId, "uploads");
  return images.reduce((sum, i) => sum + (i.size_bytes ?? 0), 0);
}

// ── Versions ──────────────────────────────────────────────────────────────────

export async function insertKBVersion(input: {
  clientId: string;
  output: TraceableBrandKB;
  modelUsed: string;
  docIdsUsed: string[];
  fillRate: number;
  note?: string;
}): Promise<ClientKBVersionRow> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("client_kb_versions")
    .insert({
      client_id: input.clientId,
      output: input.output,
      model_used: input.modelUsed,
      doc_ids_used: input.docIdsUsed,
      fill_rate: input.fillRate,
      note: input.note ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as ClientKBVersionRow;
}

export async function updateKBVersionOutput(
  versionId: string,
  output: TraceableBrandKB,
): Promise<void> {
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from("client_kb_versions")
    .update({ output })
    .eq("id", versionId);
  if (error) throw error;
}

export async function setActiveKBVersion(
  clientId: string,
  versionId: string,
): Promise<void> {
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from("clients")
    .update({ active_kb_version_id: versionId })
    .eq("id", clientId);
  if (error) throw error;
}

export async function listKBVersions(
  clientId: string,
): Promise<ClientKBVersionRow[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("client_kb_versions")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ClientKBVersionRow[];
}

export async function getActiveKBVersion(
  clientId: string,
): Promise<ClientKBVersionRow | null> {
  const supabase = createServerSupabase();
  const { data: clientRow, error: clientErr } = await supabase
    .from("clients")
    .select("active_kb_version_id")
    .eq("id", clientId)
    .maybeSingle();
  if (clientErr) throw clientErr;
  const versionId = (clientRow as { active_kb_version_id: string | null } | null)
    ?.active_kb_version_id;
  if (!versionId) return null;

  const { data, error } = await supabase
    .from("client_kb_versions")
    .select("*")
    .eq("id", versionId)
    .maybeSingle();
  if (error) throw error;
  return (data as ClientKBVersionRow) ?? null;
}
