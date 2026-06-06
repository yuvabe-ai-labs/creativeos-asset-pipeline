import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import type {
  ClientKBDocumentRow,
  ClientKBVersionRow,
  ClientBrandImageRow,
} from "./types";
import type { TraceableBrandKB } from "@/lib/kb/schema";

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

export async function listBrandImages(
  clientId: string,
): Promise<ClientBrandImageRow[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("client_brand_images")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ClientBrandImageRow[];
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

export async function getBrandImageTotalBytes(clientId: string): Promise<number> {
  const images = await listBrandImages(clientId);
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
