import type { ImportSource } from "@/lib/asset-import/constants";
import type { AssetImport } from "@/lib/asset-import/types";
import type { ClientBrandImageRow } from "@/lib/db/types";
import { readJson } from "./read-json";

export type ImportedAssetCounts = {
  total: number;
  bySource: Record<ImportSource, number>;
  byMedia: Record<"image" | "video", number>;
};

/** Where each source imports from (a URL), null when not connected. */
export type ImportTargets = Record<ImportSource, string | null>;

/** What the polled status endpoint returns — small on purpose; no assets. */
export type AssetImportStatus = { imports: AssetImport[]; counts: ImportedAssetCounts; targets: ImportTargets };

export type ImportedAssetFilters = { source: ImportSource | null; media: "image" | "video" | null };
export type ImportedAssetPage = { items: ClientBrandImageRow[]; nextCursor: string | null };

class AssetImportsService {
  /** Each source's latest import and the asset counts (D302). */
  async status(clientId: string): Promise<AssetImportStatus> {
    const res = await fetch(`/api/clients/${clientId}/asset-imports`);
    return readJson(res, "Could not load the import status.");
  }

  /** One page of imported assets, newest first. Pass the previous page's `nextCursor`. */
  async listAssets(clientId: string, filters: ImportedAssetFilters, cursor: string | null): Promise<ImportedAssetPage> {
    const q = new URLSearchParams();
    if (cursor) q.set("cursor", cursor);
    if (filters.source) q.set("source", filters.source);
    if (filters.media) q.set("media", filters.media);
    const res = await fetch(`/api/clients/${clientId}/asset-imports/assets?${q}`);
    return readJson(res, "Could not load the brand assets.");
  }

  /** Queues the imports and returns at once — the scrapes run in the background. */
  async start(clientId: string, sources?: ImportSource[]): Promise<AssetImport[]> {
    const res = await fetch(`/api/clients/${clientId}/asset-imports`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sources ? { sources } : {}),
    });
    return (await readJson<{ imports: AssetImport[] }>(res, "Could not start the import.")).imports;
  }

  /** Sets where one source imports from and imports it; a blank value disconnects it. */
  async setSource(
    clientId: string,
    source: ImportSource,
    value: string,
  ): Promise<{ targets: ImportTargets; imports?: AssetImport[] }> {
    const res = await fetch(`/api/clients/${clientId}/asset-imports/sources/${source}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value }),
    });
    return readJson(res, "Could not save the source.");
  }

  async removeAsset(clientId: string, assetId: string): Promise<void> {
    const res = await fetch(`/api/clients/${clientId}/asset-imports/assets/${assetId}`, { method: "DELETE" });
    await readJson(res, "Could not remove the asset.");
  }
}

export const assetImportsService = new AssetImportsService();
