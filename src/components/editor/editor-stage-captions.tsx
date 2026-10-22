"use client";

import { captionTimes } from "@/lib/editor/captions";
import type { CaptionLook } from "@/lib/editor/caption-style";
import { CAPTION_FONT_CSS } from "./caption-font-faces";
import { useEditorStore } from "./editor-store-provider";
import { usePlayback } from "./editor-playback-context";

/** The look of a caption on the stage: the real font, no box, a soft shadow (D393). Size is px on
 *  a frame 1080 px on its short edge, so it scales with the stage (container query units). */
export function captionTextStyle(c: Pick<CaptionLook, "font" | "size" | "color">): React.CSSProperties {
  return {
    fontFamily: CAPTION_FONT_CSS[c.font],
    fontSize: `calc(${c.size} / 1080 * 100cqmin)`,
    lineHeight: 1.15,
    color: c.color,
    textShadow: "0 0.06em 0.3em rgba(0,0,0,.6)",
  };
}

/** Captions showing at the playhead, where the reel's style places them. The selected caption
 *  gets the draggable overlay instead. */
export function EditorStageCaptions({ skipId }: { skipId?: string | null }) {
  const doc = useEditorStore((s) => s.doc);
  const style = doc.captionStyle;
  const { time } = usePlayback();
  const showing = doc.captions.filter((c) => {
    if (c.id === skipId) return false;
    const t = captionTimes(doc, c);
    return t !== null && time >= t.start && time < t.end;
  });
  return (
    <>
      {showing.map((c) => (
        <p
          key={c.id}
          className="pointer-events-none absolute m-0 w-[88%] -translate-x-1/2 -translate-y-1/2 whitespace-pre-line text-center"
          style={{ left: `${style.x * 100}%`, top: `${style.y * 100}%`, ...captionTextStyle(style) }}
        >
          {c.text}
        </p>
      ))}
    </>
  );
}
