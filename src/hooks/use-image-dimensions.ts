"use client";

import { useEffect, useState } from "react";

export type ImageDim = { width: number; height: number };

/**
 * Lazily resolve intrinsic dimensions for image URLs by loading each with a
 * hidden Image element. Cached across renders (module-level) so revisiting the
 * dialog doesn't re-fetch. Falls back to a 1:1 default until a URL resolves.
 */
const cache = new Map<string, ImageDim>();

export function useImageDimensions(urls: readonly string[]): Map<string, ImageDim> {
  const [dims, setDims] = useState<Map<string, ImageDim>>(() => {
    const initial = new Map<string, ImageDim>();
    for (const url of urls) {
      const cached = cache.get(url);
      if (cached) initial.set(url, cached);
    }
    return initial;
  });

  useEffect(() => {
    let cancelled = false;
    const pending = urls.filter((u) => !cache.has(u));
    if (pending.length === 0) return;

    for (const url of pending) {
      const img = new Image();
      img.onload = () => {
        if (cancelled) return;
        const dim: ImageDim = { width: img.naturalWidth, height: img.naturalHeight };
        cache.set(url, dim);
        setDims((prev) => new Map(prev).set(url, dim));
      };
      img.onerror = () => {
        if (cancelled) return;
        const dim: ImageDim = { width: 400, height: 400 };
        cache.set(url, dim);
        setDims((prev) => new Map(prev).set(url, dim));
      };
      img.src = url;
    }

    return () => {
      cancelled = true;
    };
  }, [urls]);

  return dims;
}
