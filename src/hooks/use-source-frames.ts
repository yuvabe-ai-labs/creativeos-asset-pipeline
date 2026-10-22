"use client";

import { useEffect, useState } from "react";

// Frames of a clip for thumbnails and filmstrips (spec A5). Drawn from a hidden <video> into
// canvases we only DISPLAY (never read back), so storage needs no CORS headers (D245). One file at a
// time for the whole page, after the reel is on screen, and kept for the visit (performance rule 1:
// no burst of loads per clip).
const FRAMES = 8;
const W = 54;
const H = 96;

type Entry = { frames: HTMLCanvasElement[]; done: boolean; listeners: Set<() => void> };
const cache = new Map<string, Entry>();
const queue: string[] = [];
let busy = false;

async function grab(url: string, entry: Entry) {
  const v = document.createElement("video");
  v.muted = true;
  v.preload = "auto";
  v.src = url;
  try {
    await new Promise<void>((res, rej) => {
      v.addEventListener("loadeddata", () => res(), { once: true });
      v.addEventListener("error", () => rej(new Error("load")), { once: true });
    });
    const d = v.duration || 1;
    for (let k = 0; k < FRAMES; k++) {
      v.currentTime = ((k + 0.5) / FRAMES) * d;
      await new Promise<void>((res) => v.addEventListener("seeked", () => res(), { once: true }));
      const c = document.createElement("canvas");
      c.width = W;
      c.height = H;
      const g = c.getContext("2d");
      if (!g) break;
      const ratio = v.videoWidth / Math.max(1, v.videoHeight);
      // cover: crop the frame to the thumbnail's shape
      const sw = ratio > W / H ? v.videoHeight * (W / H) : v.videoWidth;
      const sh = ratio > W / H ? v.videoHeight : v.videoWidth / (W / H);
      g.drawImage(v, (v.videoWidth - sw) / 2, (v.videoHeight - sh) / 2, sw, sh, 0, 0, W, H);
      entry.frames.push(c);
      entry.listeners.forEach((l) => l());
    }
  } catch {
    // no frames: the clip shows its plain tone
  } finally {
    entry.done = true;
    entry.listeners.forEach((l) => l());
    v.removeAttribute("src");
    v.load();
  }
}

async function pump() {
  if (busy) return;
  busy = true;
  while (queue.length) {
    const url = queue.shift()!;
    const entry = cache.get(url);
    if (entry && !entry.done) await grab(url, entry);
  }
  busy = false;
}

/** Up to 8 frames spread through the file, filling in as they're drawn. */
export function useSourceFrames(url: string | null): HTMLCanvasElement[] {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!url) return;
    let entry = cache.get(url);
    if (!entry) {
      entry = { frames: [], done: false, listeners: new Set() };
      cache.set(url, entry);
      queue.push(url);
      // after the reel is on screen
      window.setTimeout(() => void pump(), 300);
    }
    const listener = () => setTick((n) => n + 1);
    entry.listeners.add(listener);
    return () => {
      entry!.listeners.delete(listener);
    };
  }, [url]);
  return url ? (cache.get(url)?.frames ?? []) : [];
}
