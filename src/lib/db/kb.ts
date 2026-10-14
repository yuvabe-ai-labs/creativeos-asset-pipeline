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
import type { AssetCursor } from "@/lib/asset-import/utils";

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
 * and the only bytes the upload limit counts (D303). Imported assets are read a page at a time
 * with listImportedBrandImagesPage — a library can run to hundreds.
 */
export async function listBrandImages(
  clientId: string,
  which: "all" | "uploads" = "all",
): Promise<ClientBrandImageRow[]> {
  const supabase = createServerSupabase();
  let query = supabase.from("client_brand_images").select("*").eq("client_id", clientId);
  if (which === "uploads") query = query.eq("source", "upload");
  const { data, error } = await query.order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ClientBrandImageRow[];
}

/**
 * One page of imported assets, newest first — keyset pagination on (sort_at, id), served by
 * client_brand_images_imported_page_idx. `after` is the previous page's last row.
 */
export async function listImportedBrandImagesPage(
  clientId: string,
  opts: {
    limit: number;
    after?: AssetCursor | null;
    source?: Exclude<BrandImageSource, "upload"> | null;
    mediaType?: "image" | "video" | null;
  },
): Promise<{ items: ClientBrandImageRow[]; next: AssetCursor | null }> {
  const supabase = createServerSupabase();
  let query = supabase
    .from("client_brand_images")
    .select("*")
    .eq("client_id", clientId)
    .neq("source", "upload");
  if (opts.source) query = query.eq("source", opts.source);
  if (opts.mediaType) query = query.eq("media_type", opts.mediaType);
  if (opts.after) {
    // The cursor is validated (ISO time + UUID) before it gets here, so it cannot widen the filter.
    const { sortAt, id } = opts.after;
    query = query.or(`sort_at.lt."${sortAt}",and(sort_at.eq."${sortAt}",id.lt.${id})`);
  }
  // One extra row says whether another page exists without a count query.
  const { data, error } = await query
    .order("sort_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(opts.limit + 1);
  if (error) throw error;
  const rows = (data ?? []) as ClientBrandImageRow[];
  const items = rows.slice(0, opts.limit);
  const last = items[items.length - 1];
  return { items, next: rows.length > opts.limit && last ? { sortAt: last.sort_at, id: last.id } : null };
}

export type ImportedAssetCounts = {
  total: number;
  bySource: Record<Exclude<BrandImageSource, "upload">, number>;
  byMedia: Record<"image" | "video", number>;
};

/** How many imported assets a client has, per source and per type — head-only count queries,
 *  so the filter chips never load the rows they count. */
export async function countImportedBrandImages(clientId: string): Promise<ImportedAssetCounts> {
  const supabase = createServerSupabase();
  const count = async (column?: "source" | "media_type", value?: string) => {
    let q = supabase
      .from("client_brand_images")
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId)
      .neq("source", "upload");
    if (column && value) q = q.eq(column, value);
    const { count: n, error } = await q;
    if (error) throw error;
    return n ?? 0;
  };
  const [total, website, instagram, facebook, image, video] = await Promise.all([
    count(),
    count("source", "website"),
    count("source", "instagram"),
    count("source", "facebook"),
    count("media_type", "image"),
    count("media_type", "video"),
  ]);
  return { total, bySource: { website, instagram, facebook }, byMedia: { image, video } };
}

/** The newest post date among a client's assets from one source — what a social refresh
 *  starts from. Null when it holds none with a date. */
export async function latestImportedPostAt(
  clientId: string,
  source: Exclude<BrandImageSource, "upload">,
): Promise<string | null> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("client_brand_images")
    .select("posted_at")
    .eq("client_id", clientId)
    .eq("source", source)
    .not("posted_at", "is", null)
    .order("posted_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as { posted_at: string } | null)?.posted_at ?? null;
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
  width: number | null;
  height: number | null;
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
      width: input.width,
      height: input.height,
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

/** Deletes one of a client's brand images (its card goes with it). Another client's id deletes nothing. */
export async function deleteBrandImage(clientId: string, imageId: string): Promise<void> {
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from("client_brand_images")
    .delete()
    .eq("id", imageId)
    .eq("client_id", clientId);
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
  await deleteBrandImage(clientId, imageId);
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

/**
 * Saves a KB version's output from the review screen, all but Image Analysis, in one statement:
 * that section is kept as stored, because a background run may have rewritten it since the screen
 * loaded (D318). saveKBOutputAction lays the screen's Image Analysis reviews over it separately.
 */
export async function saveKBOutputKeepingImageAnalysis(versionId: string, output: TraceableBrandKB): Promise<void> {
  const supabase = createServerSupabase();
  const { error } = await supabase.rpc("save_kb_output_keep_image_analysis", { p_version_id: versionId, p_output: output });
  if (error) throw error;
}

/** Writes one field of a KB version, and nothing else, in one statement (D318). */
export async function setKBField(versionId: string, path: string[], field: unknown): Promise<void> {
  const supabase = createServerSupabase();
  const { error } = await supabase.rpc("set_kb_field", { p_version_id: versionId, p_path: path, p_value: field });
  if (error) throw error;
}

/** The Image Analysis section as stored on one KB version. */
export async function getKBImageAnalysis(versionId: string): Promise<TraceableBrandKB["image_analysis"] | null> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase.from("client_kb_versions").select("output->image_analysis").eq("id", versionId).maybeSingle();
  if (error) throw error;
  return ((data as { image_analysis?: TraceableBrandKB["image_analysis"] } | null)?.image_analysis) ?? null;
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
