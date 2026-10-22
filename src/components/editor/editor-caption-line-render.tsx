"use client";

import { activeWord, wordFrames } from "@/lib/editor/caption-words";
import { displayText, type CaptionStyle } from "@/lib/editor/caption-style";
import type { Caption, EditDoc } from "@/lib/editor/types";
import { lineStyle, wordStyle } from "./caption-look-css";

/** A caption's words as the stage draws them on `frame`, by the shared frame rule (D397). */
export function CaptionLineRender({ doc, caption, style, frame, fps }: { doc: EditDoc; caption: Caption; style: CaptionStyle; frame: number; fps: number }) {
  const frames = wordFrames(doc, caption, fps) ?? [];
  const active = activeWord(frames, frame);
  return (
    <span style={lineStyle(style)}>
      {frames.map((w, i) => (
        <span key={i} style={wordStyle(style, i < active ? "said" : i === active ? "active" : "upcoming")}>
          {displayText(w.text, style)}
          {i < frames.length - 1 ? " " : ""}
        </span>
      ))}
    </span>
  );
}
