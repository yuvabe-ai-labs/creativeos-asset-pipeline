import { createServerSupabase } from "@/lib/supabase/server";
import { getActiveKBVersion } from "@/lib/db/kb";
import { extractHexes } from "@/lib/post/brand-colours";
import { removeObject } from "@/lib/storage";
import type {
  BrandAsset, BrandAssetCategory, BrandDetails,
} from "@/lib/brand-kit/types";

type Row = {
  id: string;
  category: BrandAssetCategory;
  name: string;
  storage_url: string;
};

function toAsset(row: Row): BrandAsset {
  return {
    id: row.id,
    category: row.category,
    name: row.name,
    storageUrl: row.storage_url,
  };
}

export async function listBrandAssets(clientId: string): Promise<BrandAsset[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("client_brand_assets")
    .select("id, category, name, storage_url")
    .eq("client_id", clientId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as Row[]).map(toAsset);
}

export async function insertBrandAsset(args: {
  id: string;
  clientId: string;
  category: BrandAssetCategory;
  name: string;
  storageUrl: string;
}): Promise<BrandAsset> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("client_brand_assets")
    .insert({
      // The id is minted before signing so the storage path and the row agree.
      id: args.id,
      client_id: args.clientId,
      category: args.category,
      name: args.name,
      storage_url: args.storageUrl,
    })
    .select("id, category, name, storage_url")
    .single();
  if (error) throw error;
  return toAsset(data as Row);
}

/**
 * Returns false when the asset does not exist OR belongs to another client.
 *
 * The ownership check is not redundant with `withClient`: that authorises the CLIENT in the
 * URL, not the ASSET id, so without this one client could delete another's asset by
 * guessing an id. `deleteBrandImageAction` guards the same way for the same reason.
 */
export async function deleteBrandAsset(
  clientId: string,
  assetId: string,
): Promise<boolean> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("client_brand_assets")
    .select("storage_url, client_id")
    .eq("id", assetId)
    .maybeSingle();
  if (error) throw error;
  const row = data as { storage_url: string; client_id: string } | null;
  if (!row || row.client_id !== clientId) return false;

  try {
    await removeObject(row.storage_url);
  } catch {
    // Best-effort, matching deleteBrandImageAction. A tile that refuses to disappear
    // because of a storage hiccup is worse than an orphaned blob.
  }

  const { error: delErr } = await supabase
    .from("client_brand_assets")
    .delete()
    .eq("id", assetId);
  if (delErr) throw delErr;
  return true;
}

export async function getBrandDetails(clientId: string): Promise<BrandDetails> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("clients")
    .select("brand_details")
    .eq("id", clientId)
    .maybeSingle();
  if (error) throw error;
  // Absent for any client whose row predates the migration's default taking effect.
  return ((data as { brand_details: BrandDetails } | null)?.brand_details ?? {});
}

/** Merges rather than replaces, so two fields saved in quick succession cannot clobber
 *  each other — the panel debounces per field and sends only what changed. */
export async function patchBrandDetails(
  clientId: string,
  patch: BrandDetails,
): Promise<BrandDetails> {
  const current = await getBrandDetails(clientId);
  const next = { ...current, ...patch };
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from("clients")
    .update({ brand_details: next })
    .eq("id", clientId);
  if (error) throw error;
  return next;
}

/**
 * Derived from the active KB at read time, never stored (D132). A client with no KB, or a
 * KB whose palette is all prose with no hex codes, yields an empty list — the panel renders
 * its own empty state for that and the other four sections still work.
 */
export async function getBrandColours(clientId: string): Promise<string[]> {
  const version = await getActiveKBVersion(clientId);
  if (!version) return [];
  const output = version.output as Record<string, { value?: unknown } | undefined>;
  const read = (key: string): string[] => {
    const value = output?.[key]?.value;
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
  };
  return extractHexes([
    ...read("colour_palette_primary"),
    ...read("colour_palette_secondary"),
  ]);
}
