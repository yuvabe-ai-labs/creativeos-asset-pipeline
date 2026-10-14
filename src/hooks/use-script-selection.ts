"use client";

import { useEffect, useState, type RefObject } from "react";
import { MAX_SELECTION_CHARS } from "@/lib/scripts/copilot/constants";

/** A selection inside one script field, positioned relative to `container` (spec 2 §9). */
export type ScriptSelection = { path: string; text: string; offset: number; top: number; left: number };

const fieldOf = (node: Node | null) =>
  (node instanceof Element ? node : node?.parentElement)?.closest<HTMLElement>("[data-script-path]") ?? null;

/** Watches for a drag-selection that starts and ends inside the same script field. The selection
 *  stays until `clear()`, so the prompt keeps its target while the person types the instruction. */
export function useScriptSelection(container: RefObject<HTMLElement | null>, enabled: boolean) {
  const [selection, setSelection] = useState<ScriptSelection | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const onMouseUp = () => {
      const box = container.current;
      const sel = window.getSelection();
      if (!box || !sel || sel.isCollapsed || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      const field = fieldOf(range.startContainer);
      if (!field || field !== fieldOf(range.endContainer) || !box.contains(field)) return;
      const text = range.toString();
      if (!text.trim()) return;
      // The selection's start, counted in characters from the start of the field's text.
      const before = document.createRange();
      before.selectNodeContents(field);
      before.setEnd(range.startContainer, range.startOffset);
      const rect = range.getBoundingClientRect();
      const outer = box.getBoundingClientRect();
      setSelection({
        path: field.dataset.scriptPath ?? "",
        text: text.slice(0, MAX_SELECTION_CHARS),
        offset: before.toString().length,
        top: rect.bottom - outer.top + box.scrollTop + 6,
        left: Math.max(0, Math.min(rect.left - outer.left, outer.width - 320)),
      });
    };
    document.addEventListener("mouseup", onMouseUp);
    return () => document.removeEventListener("mouseup", onMouseUp);
  }, [container, enabled]);

  return { selection, clear: () => setSelection(null) };
}
