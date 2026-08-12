import { uploadViaSignedUrl } from "@/lib/uploads/client";
import type {
  BrandAsset, BrandAssetCategory, BrandDetails, BrandKitPayload,
} from "@/lib/brand-kit/types";

async function readJson<T>(res: Response, fallback: string): Promise<T> {
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error ?? fallback);
  return json as T;
}

class BrandKitService {
  async load(clientId: string): Promise<BrandKitPayload> {
    const res = await fetch(`/api/clients/${clientId}/brand-kit`);
    return readJson<BrandKitPayload>(res, "Could not load the brand kit.");
  }

  /** Signs, PUTs straight to GCS, then records the row — the same three-step flow the
   *  client logo and node files already use. */
  async upload(
    clientId: string,
    category: BrandAssetCategory,
    file: File,
  ): Promise<BrandAsset> {
    const { asset } = await uploadViaSignedUrl<{ asset: BrandAsset }>(file, {
      signEndpoint: `/api/clients/${clientId}/brand-kit/assets/sign`,
      finalizeEndpoint: `/api/clients/${clientId}/brand-kit/assets`,
      signBody: { category },
      finalizeBody: { category, name: file.name },
    });
    return asset;
  }

  async remove(clientId: string, assetId: string): Promise<void> {
    const res = await fetch(
      `/api/clients/${clientId}/brand-kit/assets/${assetId}`,
      { method: "DELETE" },
    );
    await readJson(res, "Could not remove the asset.");
  }

  async patchDetails(clientId: string, patch: BrandDetails): Promise<BrandDetails> {
    const res = await fetch(`/api/clients/${clientId}/brand-kit/details`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const { details } = await readJson<{ details: BrandDetails }>(
      res, "Could not save the detail.",
    );
    return details;
  }
}

export const brandKitService = new BrandKitService();
