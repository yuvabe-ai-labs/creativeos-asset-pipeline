"use client";

import { useCallback, useState } from "react";

/** Fade a generated image or video in once it can be drawn, over the skeleton the caller shows
 *  until then (D432). Duration and easing are the design system's. */
export const MEDIA_FADE_CLASS = "transition-opacity duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]";

/**
 * D432 — whether `src` has loaded far enough to draw, so a new output never shows as a blank or
 * black box (or the previous file) while it downloads. Give the element `key={src}` so a new file
 * is a new element, wire `onReady` to its load events, and `measure` (as its ref) to catch a file that was already
 * loaded before React attached them (the cache, or before hydration).
 */
export function useMediaReady(src: string | null) {
  const [readySrc, setReadySrc] = useState<string | null>(null);
  const onReady = useCallback(() => setReadySrc(src), [src]);
  const measure = useCallback(
    (el: HTMLImageElement | HTMLVideoElement | null) => {
      if (!el) return;
      const drawn = el instanceof HTMLImageElement ? el.complete && el.naturalWidth > 0 : el.readyState >= 2;
      if (drawn) setReadySrc(src);
    },
    [src],
  );
  return { ready: src !== null && readySrc === src, onReady, measure };
}
