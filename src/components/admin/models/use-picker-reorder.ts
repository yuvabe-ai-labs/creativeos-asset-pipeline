"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { reorderAiModelsAction } from "@/lib/actions/ai-models";
import { moveInOrder, type PickerModel } from "@/lib/admin/model-page";

const SAVE_ERROR = "Could not save. Try again.";

/**
 * One kind's picker order (every model of the kind, in order), moved one place at a time. Each move
 * saves; a failed save puts the order back. Shared by the model page's order popover and the models
 * catalog's "Picker order".
 */
export function usePickerReorder(models: PickerModel[]) {
  const [list, setList] = useState(models);
  const saving = useRef(false);

  /** Moves `id` one place up (−1) or down (+1). False when it can't move that way, or a move is still saving. */
  function move(id: string, delta: -1 | 1): boolean {
    // The arrows stay enabled while a move saves (disabling them would drop keyboard focus); a press then does nothing.
    if (saving.current) return false;
    const ids = moveInOrder(list.map((m) => m.id), id, delta);
    if (!ids) return false;
    const before = list;
    const kind = list.find((m) => m.id === id)?.kind ?? "";
    setList(ids.map((x) => list.find((m) => m.id === x) as PickerModel));
    saving.current = true;
    void (async () => {
      let error: string | undefined;
      try {
        error = (await reorderAiModelsAction(kind, ids)).error;
      } catch {
        error = SAVE_ERROR;
      }
      saving.current = false;
      if (error) {
        setList(before);
        toast.error(error);
      }
    })();
    return true;
  }

  return { list, move };
}
