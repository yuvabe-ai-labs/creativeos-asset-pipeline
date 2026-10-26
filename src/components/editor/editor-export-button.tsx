"use client";

import { useState } from "react";
import { ChevronDown, Clapperboard, Download, Film } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useStartExport } from "@/hooks/queries/editor";
import { dubLanguageLabel } from "@/lib/dubbing/types";
import { SaveFailure } from "@/lib/editor/autosave";
import { fontCoversText } from "@/lib/editor/caption-fonts";
import { ApiError } from "@/services/read-json";
import { EditorExportDialog } from "./editor-export-dialog";
import { EditorRenderDialog } from "./editor-render-dialog";
import { useEditorStore } from "./editor-store-provider";

/** Export (D417): an MP4 video or the Premiere package (spec §9). The Premiere package saves first, then starts the background export of the saved edit.
 *  A reel that can't be exported (empty, a file that can't be read) says why without a dialog. */
export function EditorExportButton({ canvasId, nodeId, title, flush }: { canvasId: string; nodeId: string; title: string; flush(): Promise<void> }) {
  const start = useStartExport(canvasId);
  const [jobId, setJobId] = useState<string | null>(null);
  const [mp4Open, setMp4Open] = useState(false);
  const hasPieces = useEditorStore((s) => s.doc.pieces.length > 0);
  const captions = useEditorStore((s) => s.doc.captions);
  const font = useEditorStore((s) => s.doc.captionStyle.font);
  const dubLanguage = useEditorStore((s) => s.sources.find((x) => x.language && s.doc.pieces.some((p) => p.sourceNodeId === x.nodeId && p.sound === "dubbed"))?.language ?? null);

  const run = async () => {
    // D393 — a caption whose font lacks some of its letters arrives in a substitute font.
    const uncovered = captions.filter((c) => !fontCoversText(font, c.text)).length;
    if (uncovered > 0) {
      toast.warning(`${uncovered} caption${uncovered === 1 ? " uses" : "s use"} letters the caption font doesn't have. Premiere will show those in another font.`);
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
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button disabled={!hasPieces || start.isPending} className="h-[38px] gap-2 rounded-[10px] px-4 font-semibold">
              <Download className="size-4" strokeWidth={1.5} />
              Export
              <ChevronDown className="size-4 opacity-70" strokeWidth={1.5} />
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuItem onClick={() => setMp4Open(true)} className="items-start gap-3 py-2">
            <Film className="mt-0.5 size-4" strokeWidth={1.5} />
            <span className="flex flex-col gap-0.5">
              <span className="font-medium">MP4 video</span>
              <span className="text-xs text-muted-foreground">Ready to post or send</span>
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void run()} className="items-start gap-3 py-2">
            <Clapperboard className="mt-0.5 size-4" strokeWidth={1.5} />
            <span className="flex flex-col gap-0.5">
              <span className="font-medium">Premiere Pro package</span>
              <span className="text-xs text-muted-foreground">An editable sequence for your editor</span>
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <EditorRenderDialog canvasId={canvasId} nodeId={nodeId} open={mp4Open} onClose={() => setMp4Open(false)} flush={flush} />
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
