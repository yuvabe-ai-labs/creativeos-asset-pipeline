"use client";

import { useCallback, useState } from "react";
import { STUDIO_STEPS, type StudioStepId } from "@/lib/avatars/studio";

// D297 — which Studio step is on screen, and which optional steps this visit left with Continue.
// The skipped set is never stored: on a later visit those steps read "Optional" again. Opening a
// step that is not open yet is the caller's to prevent — the stepper disables locked steps.
export function useStudioSteps(initial: StudioStepId) {
  const [current, setCurrent] = useState<StudioStepId>(initial);
  const [skipped, setSkipped] = useState<ReadonlySet<StudioStepId>>(() => new Set());
  const index = STUDIO_STEPS.findIndex((s) => s.id === current);

  const go = useCallback((id: StudioStepId) => setCurrent(id), []);

  const back = useCallback(() => {
    setCurrent(STUDIO_STEPS[Math.max(0, index - 1)].id);
  }, [index]);

  // Continue on an unfinished optional step is what skipping it means: there is no Skip button.
  const next = useCallback((currentDone: boolean) => {
    if (STUDIO_STEPS[index].optional && !currentDone) {
      setSkipped((prev) => new Set(prev).add(current));
    }
    setCurrent(STUDIO_STEPS[Math.min(STUDIO_STEPS.length - 1, index + 1)].id);
  }, [current, index]);

  return { current, index, skipped, go, back, next };
}
