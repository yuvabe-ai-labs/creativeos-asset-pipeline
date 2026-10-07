// client_brand_image_cards — one read of one brand image (D312).
import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import type { BrandImageSource } from "@/lib/asset-import/constants";
import type { ImageCard } from "@/lib/image-analysis/card-schema";
import type { TraceableBrandKB } from "@/lib/kb/schema";

/** PostgREST returns at most 1,000 rows a request (Supabase's default max_rows). */
const PAGE = 1000;

/** Every row of a query, a page at a time. `page(from, to)` must order by a unique column. */
async function readAll<T>(page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) return rows;
  }
}

export type ImageToRead = {
  id: string;
  source: BrandImageSource;
  storage_url: string;
  thumbnail_url: string | null;
  file_ext: string;
};

/** A client's still images (every source) with no card at `version` — what the next run reads. */
export async function listImagesNeedingCards(clientId: string, version: number): Promise<ImageToRead[]> {
  const supabase = createServerSupabase();
  const [images, cards] = await Promise.all([
    readAll<ImageToRead>((from, to) =>
      supabase
        .from("client_brand_images")
        .select("id, source, storage_url, thumbnail_url, file_ext")
        .eq("client_id", clientId)
        .eq("media_type", "image")
        .order("id")
        .range(from, to),
    ),
    readAll<{ image_id: string }>((from, to) =>
      supabase
        .from("client_brand_image_cards")
        .select("image_id")
        .eq("client_id", clientId)
        .gte("version", version)
        .order("image_id")
        .range(from, to),
    ),
  ]);
  const done = new Set(cards.map((c) => c.image_id));
  return images.filter((i) => !done.has(i.id));
}

export async function upsertImageCard(input: {
  imageId: string;
  clientId: string;
  version: number;
  model: string;
  card: ImageCard;
}): Promise<void> {
  const supabase = createServerSupabase();
  const { error } = await supabase.from("client_brand_image_cards").upsert(
    {
      image_id: input.imageId,
      client_id: input.clientId,
      version: input.version,
      model: input.model,
      format: input.card.format,
      purpose: input.card.purpose,
      card: input.card,
      created_at: new Date().toISOString(),
    },
    { onConflict: "image_id" },
  );
  // 23503: the image was deleted while it was being read. Nothing to keep.
  if (error && (error as { code?: string }).code !== "23503") throw error;
}

/** Every current card of a client, with the source of its image. */
export async function listImageCards(
  clientId: string,
  version: number,
): Promise<{ imageId: string; source: BrandImageSource; card: ImageCard }[]> {
  const supabase = createServerSupabase();
  const rows = await readAll<{ image_id: string; card: ImageCard; client_brand_images: { source: BrandImageSource } }>((from, to) =>
    supabase
      .from("client_brand_image_cards")
      .select("image_id, card, client_brand_images!inner(source)")
      .eq("client_id", clientId)
      .gte("version", version)
      .order("image_id")
      .range(from, to),
  );
  return rows.map((r) => ({ imageId: r.image_id, source: r.client_brand_images.source, card: r.card }));
}

/** How many still images a client has, and how many have a current card. */
export async function countImageCoverage(clientId: string, version: number): Promise<{ images: number; carded: number }> {
  const supabase = createServerSupabase();
  const [images, cards] = await Promise.all([
    supabase.from("client_brand_images").select("id", { count: "exact", head: true }).eq("client_id", clientId).eq("media_type", "image"),
    supabase.from("client_brand_image_cards").select("image_id", { count: "exact", head: true }).eq("client_id", clientId).gte("version", version),
  ]);
  if (images.error) throw images.error;
  if (cards.error) throw cards.error;
  return { images: images.count ?? 0, carded: cards.count ?? 0 };
}

/** Writes the Image Analysis section of one KB version, and nothing else (see 0048). */
export async function setKBImageAnalysis(versionId: string, value: TraceableBrandKB["image_analysis"]): Promise<void> {
  const supabase = createServerSupabase();
  const { error } = await supabase.rpc("set_kb_image_analysis", { p_version_id: versionId, p_value: value });
  if (error) throw error;
}
