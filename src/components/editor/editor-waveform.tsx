"use client";

import { useEffect, useRef } from "react";
import { WINDOW_SECONDS } from "@/lib/editor/silence";

/** A piece's waveform from its loudness windows (50 ms RMS), for the stretch [from, to]. */
export function EditorWaveform({ windows, from, to, width, height, muted }: { windows: Float32Array | undefined; from: number; to: number; width: number; height: number; muted: boolean }) {
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
    if (!windows || windows.length === 0) return;
    let max = 0;
    for (let i = 0; i < windows.length; i++) max = Math.max(max, windows[i]);
    if (max <= 0) return;
    g.fillStyle = getComputedStyle(c).color;
    for (let x = 0; x < width; x += 2) {
      const t = from + (x / width) * (to - from);
      const v = windows[Math.min(windows.length - 1, Math.floor(t / WINDOW_SECONDS))] / max;
      const h = Math.max(1, Math.sqrt(v) * (height - 6));
      g.fillRect(x, (height - h) / 2, 1.4, h);
    }
  }, [windows, from, to, width, height]);

  return <canvas ref={ref} aria-hidden style={{ width, height }} className={muted ? "absolute inset-0 text-muted-foreground/40" : "absolute inset-0 text-muted-foreground/70"} />;
}
