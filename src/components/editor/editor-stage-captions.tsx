"use client";

import { captionTimes } from "@/lib/editor/captions";
import { captionBoxStyle } from "./caption-look-css";
import { CaptionLineRender } from "./editor-caption-line-render";
import { useEditorStore } from "./editor-store-provider";
import { usePlayback } from "./editor-playback-context";

/** Captions showing at the playhead, word by word, where the reel's style places them (D396,
 *  D397). Click one to select it; the selected caption gets the draggable overlay instead, and a
 *  second click there edits its words (D412). */
export function EditorStageCaptions({ skipId }: { skipId?: string | null }) {
  const doc = useEditorStore((s) => s.doc);
  const select = useEditorStore((s) => s.select);
  const { time, fps } = usePlayback();
  const style = doc.captionStyle;
  const frame = Math.round(time * fps);
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
          data-keep-selection=""
          onClick={() => select({ kind: "caption", id: c.id })}
          title="Click to select, click again to edit the words"
          style={captionBoxStyle(style)}
          className="absolute m-0 w-[88%] -translate-x-1/2 -translate-y-1/2 cursor-pointer select-none whitespace-pre-line text-center outline-offset-[6px] hover:outline hover:outline-1 hover:outline-dashed hover:outline-white/60"
        >
          <CaptionLineRender doc={doc} caption={c} style={style} frame={frame} fps={fps} />
        </p>
      ))}
    </>
  );
}
