"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { toast } from "sonner";
import type { AssetOp } from "@/lib/scripts/assets";
import type { UploadTarget } from "@/services/script-assets.service";
import { useGeneratePlate, useScriptAssetOp, useUploadScriptImage } from "@/hooks/queries/script-assets";

/** D446 — what the script page may do to products, locations and picks. Present in Generate and
 *  Visualise; without it the script view shows them read-only (the review page). */
export type ScriptAssets = {
  clientId: string;
  op: (op: AssetOp) => void;
  upload: (files: File[], target: UploadTarget) => Promise<void>;
  generatePlate: (locationId: string) => void;
  /** Locations whose plate is being drawn. */
  drawing: ReadonlySet<string>;
  /** The product or location an upload is going to, while it runs. */
  uploadingTo: string | null;
};

const ScriptAssetsContext = createContext<ScriptAssets | null>(null);

export function useScriptAssets(): ScriptAssets | null {
  return useContext(ScriptAssetsContext);
}

const targetId = (t: UploadTarget) => (t.kind === "product" ? t.productId : t.locationId);
const fail = (e: unknown) => toast.error(e instanceof Error ? e.message : "That didn't work. Try again.");

export function ScriptAssetsProvider({ clientId, scriptId, children }: { clientId: string; scriptId: string; children: ReactNode }) {
  const op = useScriptAssetOp(clientId, scriptId);
  const upload = useUploadScriptImage(clientId, scriptId);
  const plate = useGeneratePlate(clientId, scriptId);

  const value = useMemo<ScriptAssets>(() => ({
    clientId,
    op: (o) => op.mutate(o, { onError: fail }),
    upload: async (files, target) => {
      // One at a time, so each lands after the last: a product's pictures keep the order chosen.
      for (const file of files) {
        try {
          await upload.mutateAsync({ file, target });
        } catch (e) {
          fail(e);
          return;
        }
      }
    },
    generatePlate: (locationId) => plate.mutate(locationId, { onError: fail }),
    drawing: new Set(plate.isPending && plate.variables ? [plate.variables] : []),
    uploadingTo: upload.isPending && upload.variables ? targetId(upload.variables.target) : null,
  }), [clientId, op, upload, plate]);

  return <ScriptAssetsContext.Provider value={value}>{children}</ScriptAssetsContext.Provider>;
}
