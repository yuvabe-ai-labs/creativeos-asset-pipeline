"use client";

import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { scriptAssetsService, type AssetWrite, type UploadTarget } from "@/services/script-assets.service";
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

export function useGeneratePlate(clientId: string, scriptId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (locationId: string) => scriptAssetsService.generatePlate(clientId, scriptId, locationId),
    onSuccess: (write) => landDoc(queryClient, clientId, scriptId, write),
  });
}
