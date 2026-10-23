"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { totalSeconds } from "@/lib/editor/timeline";
import { clampZoom, DEFAULT_ZOOM, fitZoom, zoomAround } from "@/lib/editor/timeline-view";
import { useEditorStoreApi } from "./editor-store-provider";
import { usePlayback } from "./editor-playback-context";

// How the timeline is viewed (D403, D404): zoom (px per second) and the scroll area the lanes live
// in. One per page, so the toolbar, the lanes and the keyboard agree. Snapping is always on (D415).
type View = {
  zoom: number;
  scrollerRef: RefObject<HTMLDivElement | null>;
  setZoom(z: number): void;
  zoomBy(factor: number): void;
  fit(): void;
};

const ViewContext = createContext<View | null>(null);

export function EditorViewProvider({ children }: { children: ReactNode }) {
  const store = useEditorStoreApi();
  const { time } = usePlayback();
  const [zoom, setZoomState] = useState(DEFAULT_ZOOM);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const zoomRef = useRef(DEFAULT_ZOOM);
  const timeRef = useRef(time);
  useEffect(() => {
    timeRef.current = time;
  }, [time]);

  /** Zoom keeping the playhead where it is on screen. */
  const setZoom = useCallback((z: number) => {
    const old = zoomRef.current;
    const next = clampZoom(z);
    if (next === old) return;
    zoomRef.current = next;
    setZoomState(next);
    const el = scrollerRef.current;
    if (el) {
      const left = zoomAround(old, next, timeRef.current, el.scrollLeft);
      requestAnimationFrame(() => {
        el.scrollLeft = left;
      });
    }
  }, []);

  const zoomBy = useCallback((factor: number) => setZoom(zoomRef.current * factor), [setZoom]);

  const fit = useCallback(() => {
    const el = scrollerRef.current;
    const next = fitZoom(el?.clientWidth ?? 800, totalSeconds(store.getState().doc.pieces));
    zoomRef.current = next;
    setZoomState(next);
    if (el) requestAnimationFrame(() => (el.scrollLeft = 0));
  }, [store]);

  const value = useMemo(() => ({ zoom, scrollerRef, setZoom, zoomBy, fit }), [zoom, setZoom, zoomBy, fit]);
  return <ViewContext.Provider value={value}>{children}</ViewContext.Provider>;
}

export function useEditorView(): View {
  const v = useContext(ViewContext);
  if (!v) throw new Error("useEditorView must be used inside EditorViewProvider");
  return v;
}
