"use client";

import type { Piece, SourceView } from "@/lib/editor/types";

/** Dub & lip sync for a clip (D406–D408). Filled in by Part B. */
export function EditorDubTab({ source }: { piece: Piece; source: SourceView }) {
  return <p className="m-0 text-xs text-muted-foreground">{source.files.dubAudio ? "This clip has a dub." : "Dubbing from the editor is on its way."}</p>;
}
