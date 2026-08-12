"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { brandKitService } from "@/services/brand-kit.service";
import type {
  BrandAsset, BrandAssetCategory, BrandDetails, BrandKitPayload,
} from "@/lib/brand-kit/types";

/**
 * Last-known payload per client, surviving unmount.
 *
 * The Brand panel is conditionally rendered, so every switch away from the Brand tool and
 * back remounts this hook — and without a cache that meant a full refetch and a "Loading…"
 * flash each time, for data that changes only when this same panel changes it. Seeding from
 * the cache paints instantly; the fetch still runs and replaces it, so a change made in
 * another tab is picked up on the next visit rather than being cached forever.
 */
const payloadCache = new Map<string, BrandKitPayload>();

/** Keep the cache in step with a local mutation, so remounting does not resurrect an asset
 *  that was just deleted or drop one that was just uploaded. */
function syncCache(clientId: string, patch: Partial<BrandKitPayload>) {
  const current = payloadCache.get(clientId);
  if (current) payloadCache.set(clientId, { ...current, ...patch });
}

export function useBrandKit(clientId: string) {
  const cached = payloadCache.get(clientId);
  const [assets, setAssets] = useState<BrandAsset[]>(cached?.assets ?? []);
  const [details, setDetails] = useState<BrandDetails>(cached?.details ?? {});
  const [colours, setColours] = useState<string[]>(cached?.colours ?? []);
  // Only the first visit for a client shows a loading state; later ones revalidate silently
  // behind the data already on screen.
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!clientId) {
      // No client in context yet. Not an error — just nothing to show.
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const payload = await brandKitService.load(clientId);
      payloadCache.set(clientId, payload);
      setAssets(payload.assets);
      setDetails(payload.details);
      setColours(payload.colours);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the brand kit.");
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { void reload(); }, [reload]);

  const upload = useCallback(
    async (category: BrandAssetCategory, file: File) => {
      try {
        const asset = await brandKitService.upload(clientId, category, file);
        setAssets((prev) => {
          const next = [...prev, asset];
          syncCache(clientId, { assets: next });
          return next;
        });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Upload failed");
      }
    },
    [clientId],
  );

  const remove = useCallback(
    async (assetId: string) => {
      // Not optimistic: a tile that vanishes and then reappears reads as a glitch. It
      // goes when the server says it went.
      try {
        await brandKitService.remove(clientId, assetId);
        setAssets((prev) => {
          const next = prev.filter((a) => a.id !== assetId);
          syncCache(clientId, { assets: next });
          return next;
        });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not remove the asset");
      }
    },
    [clientId],
  );

  const patchDetail = useCallback(
    async (key: keyof BrandDetails, value: string) => {
      // Local state updates immediately so the field does not fight the typist; the
      // server's merged copy replaces it on success.
      setDetails((prev) => ({ ...prev, [key]: value }));
      try {
        const next = await brandKitService.patchDetails(clientId, { [key]: value });
        syncCache(clientId, { details: next });
        setDetails(next);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not save");
      }
    },
    [clientId],
  );

  return { assets, details, colours, loading, error, reload, upload, remove, patchDetail };
}
