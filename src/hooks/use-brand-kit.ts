"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { brandKitService } from "@/services/brand-kit.service";
import type {
  BrandAsset, BrandAssetCategory, BrandDetails,
} from "@/lib/brand-kit/types";

export function useBrandKit(clientId: string) {
  const [assets, setAssets] = useState<BrandAsset[]>([]);
  const [details, setDetails] = useState<BrandDetails>({});
  const [colours, setColours] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!clientId) {
      // No client in context yet. Not an error — just nothing to show.
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const payload = await brandKitService.load(clientId);
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
        setAssets((prev) => [...prev, asset]);
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
        setAssets((prev) => prev.filter((a) => a.id !== assetId));
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
        setDetails(next);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not save");
      }
    },
    [clientId],
  );

  return { assets, details, colours, loading, error, reload, upload, remove, patchDetail };
}
