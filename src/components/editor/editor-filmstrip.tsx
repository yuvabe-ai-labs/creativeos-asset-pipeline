"use client";

import { useEffect, useRef } from "react";
import { useSourceFrames } from "@/hooks/use-source-frames";

/** A clip's own frames along its block (spec A5), for the stretch [from, to] of a `duration`-long
 *  file. Nothing until the frames are read; then they fill in. */
export function EditorFilmstrip({ url, from, to, duration, width, height }: { url: string; from: number; to: number; duration: number; width: number; height: number }) {
  const frames = useSourceFrames(url);
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = ref.current;
    if (!c || width <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(width * dpr);
    c.height = Math.round(height * dpr);
    const g = c.getContext("2d");
    if (!g) return;
    g.scale(dpr, dpr);
    g.clearRect(0, 0, width, height);
    if (frames.length === 0 || duration <= 0) return;
    const fw = (height * 9) / 16;
    for (let x = 0; x < width; x += fw) {
      const t = from + ((x + fw / 2) / width) * (to - from);
      const f = frames[Math.min(frames.length - 1, Math.max(0, Math.floor((t / duration) * frames.length)))];
      g.drawImage(f, x, 0, fw, height);
    }
  }, [frames, frames.length, from, to, duration, width, height]);

  return <canvas ref={ref} aria-hidden style={{ width, height }} className="pointer-events-none absolute inset-0 opacity-90" />;
}
