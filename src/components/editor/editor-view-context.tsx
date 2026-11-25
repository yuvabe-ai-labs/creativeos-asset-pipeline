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
  /** Fit the reel to the screen; called again while fitted, go back to the zoom and scroll before (D504). */
  fit(): void;
  /** The view is the one Fit made, so Fit now goes back. */
  fitted: boolean;
};

/** The view before Fit, and the zoom Fit chose (a zoom since then means the user moved on). */
type BeforeFit = { zoom: number; scrollLeft: number; fitZoom: number };

const ViewContext = createContext<View | null>(null);

export function EditorViewProvider({ children }: { children: ReactNode }) {
  const store = useEditorStoreApi();
  const { time } = usePlayback();
  const [zoom, setZoomState] = useState(DEFAULT_ZOOM);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const zoomRef = useRef(DEFAULT_ZOOM);
  const timeRef = useRef(time);
  const beforeFitRef = useRef<BeforeFit | null>(null);
  const [fitted, setFitted] = useState(false);
  const clearFit = useCallback(() => {
    beforeFitRef.current = null;
    setFitted(false);
  }, []);
  useEffect(() => {
    timeRef.current = time;
  }, [time]);

  /** Zoom keeping the playhead where it is on screen. */
  const setZoom = useCallback((z: number) => {
    const old = zoomRef.current;
    const next = clampZoom(z);
    if (next === old) return;
    clearFit();
    zoomRef.current = next;
    setZoomState(next);
    const el = scrollerRef.current;
    if (el) {
      const left = zoomAround(old, next, timeRef.current, el.scrollLeft);
      requestAnimationFrame(() => {
        el.scrollLeft = left;
      });
    }
  }, [clearFit]);

  const zoomBy = useCallback((factor: number) => setZoom(zoomRef.current * factor), [setZoom]);

  const fit = useCallback(() => {
    const el = scrollerRef.current;
    const before = beforeFitRef.current;
    // Second press while still fitted: back to where the user was.
    if (before && zoomRef.current === before.fitZoom) {
      clearFit();
      zoomRef.current = before.zoom;
      setZoomState(before.zoom);
      if (el) requestAnimationFrame(() => (el.scrollLeft = before.scrollLeft));
      return;
    }
    const next = fitZoom(el?.clientWidth ?? 800, totalSeconds(store.getState().doc.pieces));
    beforeFitRef.current = { zoom: zoomRef.current, scrollLeft: el?.scrollLeft ?? 0, fitZoom: next };
    setFitted(true);
    zoomRef.current = next;
    setZoomState(next);
    if (el) requestAnimationFrame(() => (el.scrollLeft = 0));
  }, [store, clearFit]);

  const value = useMemo(() => ({ zoom, scrollerRef, setZoom, zoomBy, fit, fitted }), [zoom, setZoom, zoomBy, fit, fitted]);
  return <ViewContext.Provider value={value}>{children}</ViewContext.Provider>;
}

export function useEditorView(): View {
  const v = useContext(ViewContext);
  if (!v) throw new Error("useEditorView must be used inside EditorViewProvider");
  return v;
}
