"use client";

import { useMemo } from "react";
import { useMutation, useMutationState, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { scriptAssetsService, type AssetWrite, type PlateRedraw, type UploadTarget } from "@/services/script-assets.service";
import type { AssetOp } from "@/lib/scripts/assets";
import type { GenerateState } from "@/lib/scripts/copilot/schema";
import { scriptKeys } from "./scripts";
import { visualiseKeys, type BoardData } from "./visualise";

// D446, D448 — a script's products and locations. They live inside the script doc, so there is no
// cache of their own: every write lands the server's doc in whichever of the two caches that already
// hold this script (the Generate state, the Visualise board). Only at Generate is it read once more.

function landDoc(queryClient: QueryClient, clientId: string, scriptId: string, { doc, stage }: AssetWrite) {
  const generate = scriptKeys.generate(clientId, scriptId);
  queryClient.setQueryData<GenerateState>(generate, (prev: GenerateState | undefined) =>
    prev ? { ...prev, script: { ...prev.script, doc } } : prev,
  );
  queryClient.setQueryData<BoardData>(visualiseKeys.board(clientId, scriptId), (prev: BoardData | undefined) =>
    prev ? { ...prev, script: { ...prev.script, doc } } : prev,
  );
  // At Generate the write moved the doc version the copilot's proposals compare against (D337), and
  // the open items may have changed: read the state once more so both are current.
  if (stage === "generate") void queryClient.invalidateQueries({ queryKey: generate });
}

export function useScriptAssetOp(clientId: string, scriptId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (op: AssetOp) => scriptAssetsService.applyOp(clientId, scriptId, op),
    onSuccess: (write) => landDoc(queryClient, clientId, scriptId, write),
  });
}

export function useUploadScriptImage(clientId: string, scriptId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ file, target }: { file: File; target: UploadTarget }) =>
      scriptAssetsService.upload(clientId, scriptId, file, target),
    onSuccess: (write) => landDoc(queryClient, clientId, scriptId, write),
  });
}

const plateKey = (clientId: string, scriptId: string) => ["script-assets", clientId, scriptId, "plate"] as const;
type PlateVars = { locationId: string; redraw?: PlateRedraw };

export function useGeneratePlate(clientId: string, scriptId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: plateKey(clientId, scriptId),
    mutationFn: ({ locationId, redraw }: PlateVars) => scriptAssetsService.generatePlate(clientId, scriptId, locationId, redraw),
    onSuccess: (write) => landDoc(queryClient, clientId, scriptId, write),
  });
}

/** Every location whose plate is drawing NOW. One mutation's `isPending` / `variables` describe
 *  only its latest call, so a second Generate hid the first one's spinner and re-enabled its button
 *  (a double, billed draw). The mutation cache holds each call while it runs. */
export function useDrawingPlates(clientId: string, scriptId: string): ReadonlySet<string> {
  const ids = useMutationState({
    filters: { mutationKey: plateKey(clientId, scriptId), status: "pending" },
    select: (m) => (m.state.variables as PlateVars | undefined)?.locationId ?? "",
  });
  const key = [...new Set(ids.filter(Boolean))].sort().join(",");
  // Stable while the same plates draw, so consumers can depend on it.
  return useMemo(() => new Set(key ? key.split(",") : []), [key]);
}
