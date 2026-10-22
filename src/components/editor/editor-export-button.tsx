"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useStartExport } from "@/hooks/queries/editor";
import { dubLanguageLabel } from "@/lib/dubbing/types";
import { SaveFailure } from "@/lib/editor/autosave";
import { fontCoversText } from "@/lib/editor/caption-fonts";
import { ApiError } from "@/services/read-json";
import { EditorExportDialog } from "./editor-export-dialog";
import { useEditorStore } from "./editor-store-provider";

/** Export to Premiere (spec §9): saves first, then starts the background export of the saved edit.
 *  A reel that can't be exported (empty, a file that can't be read) says why without a dialog. */
export function EditorExportButton({ canvasId, nodeId, title, flush }: { canvasId: string; nodeId: string; title: string; flush(): Promise<void> }) {
  const start = useStartExport(canvasId);
  const [jobId, setJobId] = useState<string | null>(null);
  const hasPieces = useEditorStore((s) => s.doc.pieces.length > 0);
  const captions = useEditorStore((s) => s.doc.captions);
  const dubLanguage = useEditorStore((s) => s.sources.find((x) => x.language && s.doc.pieces.some((p) => p.sourceNodeId === x.nodeId && p.sound === "dubbed"))?.language ?? null);

  const run = async () => {
    // D393 — a caption whose font lacks some of its letters arrives in a substitute font.
    const uncovered = captions.filter((c) => !fontCoversText(c.font, c.text)).length;
    if (uncovered > 0) {
      toast.warning(`${uncovered} caption${uncovered === 1 ? " uses" : "s use"} letters ${uncovered === 1 ? "its" : "their"} font doesn't have. Premiere will show those in another font.`);
    }
    try {
      await flush();
      const { jobId: id } = await start.mutateAsync(nodeId);
      setJobId(id);
    } catch (err) {
      if (err instanceof SaveFailure) toast.error(`Your latest changes aren't saved, so the export didn't start. ${err.message}`);
      else toast.error(err instanceof ApiError || err instanceof Error ? err.message : "Couldn't start the export.");
    }
  };

  return (
    <>
      <Button onClick={() => void run()} disabled={!hasPieces || start.isPending} className="h-[38px] gap-2 rounded-[10px] px-4 font-semibold">
        <Download className="size-4" strokeWidth={1.5} />
        Export to Premiere
      </Button>
      <EditorExportDialog
        canvasId={canvasId}
        jobId={jobId}
        title={title}
        dubLabel={dubLanguage ? dubLanguageLabel(dubLanguage) : null}
        onClose={() => setJobId(null)}
        onRetry={() => {
          setJobId(null);
          void run();
        }}
      />
    </>
  );
}
