"use client";

import { dubLanguageLabel } from "@/lib/dubbing/types";
import type { Piece } from "@/lib/editor/types";
import { useAutoCaptionsContext } from "./auto-captions-context";
import { useEditorDubContext } from "./editor-dub-context";
import { useEditorStore } from "./editor-store-provider";
import type { EditorTask } from "./editor-ui-context";

export type TaskRow = { task: EditorTask; label: string; meta: string; disabled: boolean };

export const TASK_LABEL: Record<EditorTask, string> = { captions: "Captions", dub: "Dub", lip: "Lip sync" };

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/** The three things a clip — or the whole reel — can have done to it, each with where it stands.
 *  Shared by the Inspector's task list, the clip's right-click and ⋯ menus, and All clips. */
export function useEditorTasks(piece: Piece | null): TaskRow[] {
  const captions = useEditorStore((s) => s.doc.captions);
  const pieces = useEditorStore((s) => s.doc.pieces);
  const source = useEditorStore((s) => (piece ? s.sources.find((x) => x.nodeId === piece.sourceNodeId) : undefined));
  const { listening } = useAutoCaptionsContext();
  const dub = useEditorDubContext();

  if (!piece) {
    const bare = pieces.filter((p) => !captions.some((c) => c.pieceId === p.id)).length;
    return [
      { task: "captions", label: TASK_LABEL.captions, meta: bare ? `${plural(bare, "clip")} without captions` : "Every clip has captions", disabled: pieces.length === 0 },
      // Dubbing or lip syncing every clip at once isn't built yet: pick a clip to do it.
      { task: "dub", label: TASK_LABEL.dub, meta: "Select a clip to dub it", disabled: true },
      { task: "lip", label: TASK_LABEL.lip, meta: "Select a dubbed clip to lip sync it", disabled: true },
    ];
  }

  const lines = captions.filter((c) => c.pieceId === piece.id).length;
  const running = source ? dub.busy.get(source.nodeId) : undefined;
  const hasDub = Boolean(source?.files.dubAudio);
  const hasLip = Boolean(source?.files.lipSynced);
  const lang = source?.language ? dubLanguageLabel(source.language) : null;

  return [
    { task: "captions", label: TASK_LABEL.captions, meta: listening.has(piece.id) ? "Listening…" : lines ? plural(lines, "line") : "No captions yet", disabled: false },
    { task: "dub", label: TASK_LABEL.dub, meta: running === "dub" ? "Dubbing…" : hasDub ? `Dubbed${lang ? ` · ${lang}` : ""}` : "Not dubbed", disabled: !source },
    {
      task: "lip",
      label: TASK_LABEL.lip,
      meta: running === "lipsync" ? "Lip-syncing…" : hasLip ? `Lip-synced${lang ? ` · ${lang}` : ""}` : hasDub ? "Ready to lip sync" : "Needs a dub first",
      disabled: !source,
    },
  ];
}
