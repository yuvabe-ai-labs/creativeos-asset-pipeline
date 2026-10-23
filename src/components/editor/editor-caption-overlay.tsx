"use client";
// The selected caption on the stage: drag inside it to move every caption, drag a corner to
// resize (D396). Snaps to both centre lines; a label says what is changing. A drag is one undo
// step (D400).
import { useRef, useState } from "react";
import { applyCaptionStyle } from "@/lib/editor/caption-style";
import type { Caption } from "@/lib/editor/types";
import { captionBoxStyle } from "./caption-look-css";
import { CaptionLineRender } from "./editor-caption-line-render";
import { useEditorStore, useEditorStoreApi } from "./editor-store-provider";
import { usePlayback } from "./editor-playback-context";

const EDGE = 0.04;
const SNAP = 0.015;
const CORNERS = [
  "-left-[7px] -top-[7px] cursor-nwse-resize",
  "-right-[7px] -top-[7px] cursor-nesw-resize",
  "-left-[7px] -bottom-[7px] cursor-nesw-resize",
  "-right-[7px] -bottom-[7px] cursor-nwse-resize",
];

type Drag = { mode: "move" | "size"; dx: number; dy: number; size0: number; dist0: number; cx: number; cy: number };

export function EditorCaptionOverlay({ caption, editable }: { caption: Caption; editable: boolean }) {
  const store = useEditorStoreApi();
  const doc = useEditorStore((s) => s.doc);
  const style = doc.captionStyle;
  const count = doc.captions.length;
  const { time, fps } = usePlayback();
  const drag = useRef<Drag | null>(null);
  const [guides, setGuides] = useState<{ v: boolean; h: boolean } | null>(null);
  const [label, setLabel] = useState<string | null>(null);
  const frameOf = (el: HTMLElement) => el.closest("[data-stage-frame]")!.getBoundingClientRect();
  const clamp = (v: number) => Math.min(1 - EDGE, Math.max(EDGE, v));
  const all = `all ${count} caption${count === 1 ? "" : "s"}`;

  const down = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!editable) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const r = frameOf(e.currentTarget);
    const corner = (e.target as HTMLElement).dataset.corner !== undefined;
    const cx = r.left + style.x * r.width;
    const cy = r.top + style.y * r.height;
    drag.current = {
      mode: corner ? "size" : "move",
      dx: (e.clientX - r.left) / r.width - style.x,
      dy: (e.clientY - r.top) / r.height - style.y,
      size0: style.size,
      dist0: Math.max(10, Math.hypot(e.clientX - cx, e.clientY - cy)),
      cx,
      cy,
    };
    store.getState().begin();
  };

  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    if (d.mode === "move") {
      const r = frameOf(e.currentTarget);
      let x = clamp((e.clientX - r.left) / r.width - d.dx);
      let y = clamp((e.clientY - r.top) / r.height - d.dy);
      const v = Math.abs(x - 0.5) < SNAP;
      const h = Math.abs(y - 0.5) < SNAP;
      if (v) x = 0.5;
      if (h) y = 0.5;
      setGuides({ v, h });
      setLabel(`Moving · ${all}${v && h ? " · Centred" : v ? " · Centred across" : h ? " · Centred down" : ""}`);
      store.getState().apply((cur) => applyCaptionStyle(cur, { x, y }));
    } else {
      const size = d.size0 * (Math.hypot(e.clientX - d.cx, e.clientY - d.cy) / d.dist0);
      store.getState().apply((cur) => applyCaptionStyle(cur, { size }));
      setLabel(`Size ${store.getState().doc.captionStyle.size} px · ${all}`);
    }
  };

  const up = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    drag.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
    store.getState().commit();
    setGuides(null);
    setLabel(null);
  };

  return (
    <>
      {guides?.v && <div aria-hidden className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-white/60" />}
      {guides?.h && <div aria-hidden className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-white/60" />}
      {label && (
        <span className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-foreground/85 px-2.5 py-1 text-[11px] text-background">
          {label}
        </span>
      )}
      <div
        role="presentation"
        title={editable ? "Drag to move every caption · drag a corner to resize" : undefined}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        style={captionBoxStyle(style)}
        className="absolute w-[88%] -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none select-none whitespace-pre-line text-center outline outline-[1.5px] outline-offset-[6px] outline-white active:cursor-grabbing"
      >
        <CaptionLineRender doc={doc} caption={caption} style={style} frame={Math.round(time * fps)} fps={fps} />
        {editable && CORNERS.map((pos) => <span key={pos} data-corner="" aria-hidden className={`absolute size-[11px] rounded-[3px] border-[1.5px] border-primary bg-white ${pos}`} />)}
      </div>
    </>
  );
}
