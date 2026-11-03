"use client";

import { useState } from "react";

/** What a focus view's server-resolved inputs depend on, as the canvas shows it: which inputs are
 *  wired in, and each one's picture (a connected Image Gen finishing changes it). */
export function connectedInputsKey(upstream: ReadonlyArray<{ id: string; fileUrl?: string }>): string {
  return upstream.map((u) => `${u.id}|${u.fileUrl ?? ""}`).join(",");
}

/**
 * Calls `onChange` (during render, React's documented alternative to a reset effect) when the
 * connected inputs change while the view is open: an input added from the rail's Add button or
 * the gallery, or unwired with its ✕. The prompt focus views resolve their inputs once per open
 * (flush, then compile-preview); this re-arms that, so the rail shows a new input's preview
 * without a close-and-reopen. Returns the key, for the effect that re-runs the flush.
 */
export function useConnectedInputsKey(
  upstream: ReadonlyArray<{ id: string; fileUrl?: string }>,
  open: boolean,
  onChange: () => void,
): string {
  const key = connectedInputsKey(upstream);
  const [seen, setSeen] = useState(key);
  if (seen !== key) {
    setSeen(key);
    if (open) onChange();
  }
  return key;
}
