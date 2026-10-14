"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { visualiseService } from "@/services/visualise.service";
import { ApiError } from "@/services/read-json";
import { errorMessage } from "@/lib/avatars/utils";
import { GENERATE_ALL_CONCURRENCY } from "@/lib/scripts/visualise/constants";
import { runQueue } from "@/lib/scripts/visualise/queue";
import type { DrawBody } from "@/lib/scripts/visualise/schema";
import { visualiseKeys } from "@/hooks/queries/visualise";

type DrawResult = { ok: true } | { ok: false; message: string; capped: boolean };

// D346 — drawing panels from the browser: one shot, or Generate all as a bounded queue that
// stops starting new draws at the credit cap. `drawing` lets a panel show its placeholder the
// moment the click lands, before the server's running take is read back.
/** `modelId` is the panel model chosen under Advanced; every draw sends it. */
export function usePanelDraws(clientId: string, scriptId: string, modelId: string) {
  const queryClient = useQueryClient();
  const [drawing, setDrawing] = useState<ReadonlySet<string>>(() => new Set());
  const [drawingAll, setDrawingAll] = useState(false);

  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: visualiseKeys.board(clientId, scriptId) }),
    [queryClient, clientId, scriptId],
  );

  const drawQuietly = useCallback(async (shotId: string, body: DrawBody): Promise<DrawResult> => {
    setDrawing((prev) => new Set(prev).add(shotId));
    try {
      await visualiseService.draw(clientId, scriptId, shotId, { ...body, modelId });
      return { ok: true };
    } catch (e) {
      return { ok: false, message: errorMessage(e, "Could not draw the panel"), capped: e instanceof ApiError && e.status === 402 };
    } finally {
      setDrawing((prev) => {
        const next = new Set(prev);
        next.delete(shotId);
        return next;
      });
      void refresh();
    }
  }, [clientId, scriptId, modelId, refresh]);

  const draw = useCallback(async (shotId: string, body: DrawBody = { kind: "draw" }) => {
    const result = await drawQuietly(shotId, body);
    if (!result.ok) toast.error(result.message);
  }, [drawQuietly]);

  const drawAll = useCallback(async (shotIds: string[]) => {
    setDrawingAll(true);
    let capped = false;
    const errors = new Set<string>();
    try {
      await runQueue(shotIds, GENERATE_ALL_CONCURRENCY, async (shotId) => {
        const result = await drawQuietly(shotId, { kind: "draw" });
        if (!result.ok) {
          errors.add(result.message);
          if (result.capped) capped = true;
        }
      }, () => capped);
    } finally {
      setDrawingAll(false);
    }
    // The same failure (the cap, a blocked prompt) usually hits several panels: say each once.
    for (const message of errors) toast.error(message);
  }, [drawQuietly]);

  return { drawing, drawingAll, draw, drawAll };
}
