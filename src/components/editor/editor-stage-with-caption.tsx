"use client";

import { captionTimes } from "@/lib/editor/captions";
import { EditorCaptionOverlay } from "./editor-caption-overlay";
import { useEditorStore } from "./editor-store-provider";
import { usePlayback } from "./editor-playback-context";
import { EditorStage } from "./editor-stage";

/** The stage, with the selected caption draggable on it while the playhead is inside it. Dragging
 *  moves every caption: position belongs to the reel's caption style (D396). */
export function EditorStageWithCaption() {
  const doc = useEditorStore((s) => s.doc);
  const selection = useEditorStore((s) => s.selection);
  const editable = useEditorStore((s) => s.editable);
  const { time } = usePlayback();

  const caption = selection?.kind === "caption" ? doc.captions.find((c) => c.id === selection.id) : undefined;
  const t = caption && captionTimes(doc, caption);
  const showing = caption && t && time >= t.start && time < t.end;

  return <EditorStage overlayCaptionId={showing ? caption.id : null} overlay={showing ? <EditorCaptionOverlay key={caption.id} caption={caption} editable={editable} /> : null} />;
}
