"use client";

import { useCallback, useEffect, useState } from "react";
import { clampTimelineHeight, DEFAULT_LAYOUT, readLayout, type EditorLayout } from "@/lib/editor/layout";

const KEY = "creativeos.editor.layout.v1";

/** Side panels and timeline height, remembered per browser (D403). Storage can be missing or
 *  blocked; the page works with the defaults then. */
export function useEditorLayout() {
  const [layout, setLayout] = useState<EditorLayout>(DEFAULT_LAYOUT);

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(KEY);
    } catch {
      stored = null;
    }
    const next = readLayout(stored);
    // Read after mount: the server render can't know this browser's choice.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one read of browser storage
    setLayout({ ...next, timelineHeight: clampTimelineHeight(next.timelineHeight, window.innerHeight) });
  }, []);

  const update = useCallback((patch: (prev: EditorLayout) => Partial<EditorLayout>) => {
    setLayout((prev) => ({ ...prev, ...patch(prev) }));
  }, []);

  // Remember each change; storage can be blocked, and the change still applies for this visit.
  useEffect(() => {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(layout));
    } catch {
      // ignore
    }
  }, [layout]);

  const setTimelineHeight = useCallback((h: number) => update(() => ({ timelineHeight: clampTimelineHeight(h, window.innerHeight) })), [update]);
  const toggleSources = useCallback(() => update((l) => ({ sources: !l.sources })), [update]);
  const toggleInspector = useCallback(() => update((l) => ({ inspector: !l.inspector })), [update]);

  return { layout, setTimelineHeight, toggleSources, toggleInspector };
}

export type EditorLayoutApi = ReturnType<typeof useEditorLayout>;
