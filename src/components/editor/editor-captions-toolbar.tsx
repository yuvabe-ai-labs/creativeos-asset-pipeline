"use client";

import { useRef } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addCaption, attachCues, docToCues } from "@/lib/editor/captions";
import { parseSrt, toSrt } from "@/lib/editor/srt";
import { useEditorStore, useEditorStoreApi } from "./editor-store-provider";
import { usePlayback } from "./editor-playback-context";

/** Add a caption at the playhead, or bring captions in and out as SRT (spec §7). */
export function EditorCaptionsToolbar() {
  const store = useEditorStoreApi();
  const editable = useEditorStore((s) => s.editable);
  const hasPieces = useEditorStore((s) => s.doc.pieces.length > 0);
  const hasCaptions = useEditorStore((s) => s.doc.captions.length > 0);
  const { time } = usePlayback();
  const fileRef = useRef<HTMLInputElement>(null);

  const add = () => {
    const id = crypto.randomUUID();
    store.getState().apply((d) => addCaption(d, time, id));
    if (store.getState().doc.captions.some((c) => c.id === id)) store.getState().select({ kind: "caption", id });
  };

  const importSrt = async (file: File) => {
    const cues = parseSrt(await file.text());
    if (cues.length === 0) {
      toast.error("No captions found in that file.");
      return;
    }
    let added = 0;
    let dropped = 0;
    store.getState().apply((d) => {
      const r = attachCues(d, cues, () => crypto.randomUUID());
      added = r.doc.captions.length - d.captions.length;
      dropped = r.dropped;
      return r.doc;
    });
    toast(`${added} caption${added === 1 ? "" : "s"} added${dropped ? ` · ${dropped} started after the reel ends` : ""}`);
  };

  const exportSrt = () => {
    const blob = new Blob([toSrt(docToCues(store.getState().doc))], { type: "application/x-subrip" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "captions.srt";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 20_000);
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={add} disabled={!editable || !hasPieces} className="gap-1 border-dashed border-primary/40 text-primary hover:bg-primary/5">
        <Plus className="size-3.5" strokeWidth={1.5} />
        Caption
      </Button>
      <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={!editable || !hasPieces}>
        Import SRT
      </Button>
      <Input
        ref={fileRef}
        type="file"
        accept=".srt"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void importSrt(file);
        }}
      />
      <Button variant="outline" size="sm" onClick={exportSrt} disabled={!hasCaptions}>
        Export SRT
      </Button>
    </>
  );
}
