"use client";
// The selected caption on the stage (mockup "Editor, caption selected"), ported from the rough-cut
// spike: drawn as the Premiere title will be — the real font, no box, a soft shadow — and dragged
// anywhere on the frame like motion-graphics text, keeping the grab offset. A dashed frame with
// corner handles marks it; a guide and a hint show when it sits on the centre line.
import { useRef } from "react";
import type { Caption } from "@/lib/editor/types";
import { captionTextStyle } from "./editor-stage-captions";

const EDGE_MARGIN = 0.04;
const CENTRE_SNAP = 0.01;

export function EditorCaptionOverlay({ caption, editable, onMove }: { caption: Caption; editable: boolean; onMove(x: number, y: number): void }) {
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const clamp = (v: number) => Math.min(1 - EDGE_MARGIN, Math.max(EDGE_MARGIN, v));
  const frameRect = (el: HTMLElement) => el.parentElement!.getBoundingClientRect();
  const centred = Math.abs(caption.x - 0.5) < CENTRE_SNAP;

  return (
    <>
      {centred && <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-white/50" />}
      <div
        role="presentation"
        onPointerDown={(e) => {
          if (!editable) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          const r = frameRect(e.currentTarget);
          drag.current = { dx: (e.clientX - r.left) / r.width - caption.x, dy: (e.clientY - r.top) / r.height - caption.y };
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const r = frameRect(e.currentTarget);
          const x = clamp((e.clientX - r.left) / r.width - drag.current.dx);
          onMove(Math.abs(x - 0.5) < CENTRE_SNAP ? 0.5 : x, clamp((e.clientY - r.top) / r.height - drag.current.dy));
        }}
        onPointerUp={(e) => {
          drag.current = null;
          e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        style={{ left: `${caption.x * 100}%`, top: `${caption.y * 100}%` }}
        className="absolute w-[88%] -translate-x-1/2 -translate-y-1/2 cursor-move select-none rounded px-2 py-1.5 outline-dashed outline-[1.5px] outline-offset-2 outline-white/90"
      >
        <p className="m-0 whitespace-pre-line text-center" style={captionTextStyle(caption)}>{caption.text}</p>
        {["-left-[5px] -top-[5px]", "-right-[5px] -top-[5px]", "-left-[5px] -bottom-[5px]", "-right-[5px] -bottom-[5px]"].map((pos) => (
          <span key={pos} aria-hidden="true" className={`absolute size-2 rounded-[2px] bg-white ${pos}`} />
        ))}
      </div>
      {centred && (
        <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-card px-2 py-0.5 text-[11px] text-foreground" style={{ top: `calc(${caption.y * 100}% + 11cqmin)` }}>
          Centred · drag to place
        </span>
      )}
    </>
  );
}
