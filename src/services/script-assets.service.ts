import { uploadViaSignedUrl } from "@/lib/uploads/client";
import type { AssetOp } from "@/lib/scripts/assets";
import type { ScriptDoc } from "@/lib/scripts/schema";
import type { ScriptStage } from "@/lib/scripts/constants";
import { readJson } from "./read-json";

// D446, D448 — a script's products and locations: one call per route, no caching.

export type AssetWrite = { doc: ScriptDoc; stage: ScriptStage };
export type UploadTarget = { kind: "product"; productId: string } | { kind: "location"; locationId: string };

class ScriptAssetsService {
  async applyOp(clientId: string, scriptId: string, op: AssetOp): Promise<AssetWrite> {
    const res = await fetch(`/api/clients/${clientId}/scripts/${scriptId}/assets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(op),
    });
    return readJson<AssetWrite>(res, "Could not change the script.");
  }

  /** Straight to storage through a signed URL, then recorded on the product or location. */
  async upload(clientId: string, scriptId: string, file: File, target: UploadTarget): Promise<AssetWrite> {
    const base = `/api/clients/${clientId}/scripts/${scriptId}/assets`;
    return uploadViaSignedUrl<AssetWrite>(file, {
      signEndpoint: `${base}/sign`,
      finalizeEndpoint: `${base}/uploaded`,
      signBody: { kind: target.kind === "product" ? "products" : "locations" },
      finalizeBody: { target },
    });
  }

  async generatePlate(clientId: string, scriptId: string, locationId: string): Promise<AssetWrite> {
    const res = await fetch(`/api/clients/${clientId}/scripts/${scriptId}/locations/${locationId}/plate`, { method: "POST" });
    return readJson<AssetWrite>(res, "Could not draw the location.");
  }
}

export const scriptAssetsService = new ScriptAssetsService();
