"use client";

import { useMemo } from "react";
import { useMutation, useMutationState, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { scriptAssetsService, type AssetWrite, type PlateRedraw, type UploadTarget } from "@/services/script-assets.service";
import { applyAssetOp, type AssetOp } from "@/lib/scripts/assets";
import type { ScriptDoc } from "@/lib/scripts/schema";
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

const opKey = (clientId: string, scriptId: string) => ["script-assets", clientId, scriptId, "op"] as const;

/** Applies an op to whichever cached copy holds this script's doc, through the same pure
 *  `applyAssetOp` the server runs. An op it rejects leaves that copy alone. */
function applyLocally(queryClient: QueryClient, clientId: string, scriptId: string, op: AssetOp) {
  const step = <T extends { script: { doc: ScriptDoc } }>(prev: T | undefined): T | undefined => {
    if (!prev) return prev;
    const res = applyAssetOp(prev.script.doc, op);
    return res.ok ? { ...prev, script: { ...prev.script, doc: res.doc } } : prev;
  };
  queryClient.setQueryData<GenerateState>(scriptKeys.generate(clientId, scriptId), step);
  queryClient.setQueryData<BoardData>(visualiseKeys.board(clientId, scriptId), step);
}

export function useScriptAssetOp(clientId: string, scriptId: string) {
  const queryClient = useQueryClient();
  const generate = scriptKeys.generate(clientId, scriptId);
  const board = visualiseKeys.board(clientId, scriptId);
  return useMutation({
    mutationKey: opKey(clientId, scriptId),
    mutationFn: (op: AssetOp) => scriptAssetsService.applyOp(clientId, scriptId, op),
    // Show the pick at once: a picker that waits on the round trip keeps showing (and ticking) the
    // old value until the server answers. A read in flight would land the old doc over it, so stop it.
    onMutate: async (op) => {
      await Promise.all([queryClient.cancelQueries({ queryKey: generate }), queryClient.cancelQueries({ queryKey: board })]);
      const before = { generate: queryClient.getQueryData<GenerateState>(generate), board: queryClient.getQueryData<BoardData>(board) };
      applyLocally(queryClient, clientId, scriptId, op);
      return before;
    },
    onError: (_e, _op, before) => {
      if (before) {
        queryClient.setQueryData(generate, before.generate);
        queryClient.setQueryData(board, before.board);
      }
      void queryClient.invalidateQueries({ queryKey: generate });
      void queryClient.invalidateQueries({ queryKey: board });
    },
    // While a later op is still on its way, this answer predates it: landing it would flash the
    // later pick back to this one. The last op to finish lands the server's doc.
    onSuccess: (write) => {
      if (queryClient.isMutating({ mutationKey: opKey(clientId, scriptId) }) > 1) return;
      landDoc(queryClient, clientId, scriptId, write);
    },
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
