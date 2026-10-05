import type { ImportSource } from "@/lib/asset-import/constants";
import type { AssetImport } from "@/lib/asset-import/types";
import type { ClientBrandImageRow } from "@/lib/db/types";
import { readJson } from "./read-json";

export type AssetImportsPayload = { imports: AssetImport[]; assets: ClientBrandImageRow[] };

class AssetImportsService {
  /** Each source's latest import and every imported asset (D302). */
  async list(clientId: string): Promise<AssetImportsPayload> {
    const res = await fetch(`/api/clients/${clientId}/asset-imports`);
    return readJson(res, "Could not load the imported assets.");
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

  async removeAsset(clientId: string, assetId: string): Promise<void> {
    const res = await fetch(`/api/clients/${clientId}/asset-imports/assets/${assetId}`, { method: "DELETE" });
    await readJson(res, "Could not remove the asset.");
  }
}

export const assetImportsService = new AssetImportsService();
