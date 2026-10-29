"use client";
// The export dialog (Export artboard, spec §9): progress while the package is built, then what's
// in it, how to open it, and the download. A failure says what went wrong and offers a retry.
import { useMemo } from "react";
import { Check, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useExportStatus } from "@/hooks/queries/editor";
import { captionFont } from "@/lib/editor/caption-fonts";
import { exportChecklist, exportSubtitle } from "@/lib/editor/export-copy";
import { EditorExportHowTo, EditorExportTracks } from "./editor-export-howto";
import { useEditorStore } from "./editor-store-provider";

export function EditorExportDialog({ canvasId, jobId, title, dubLabel, onClose, onRetry }: {
  canvasId: string;
  jobId: string | null;
  title: string;
  dubLabel: string | null;
  onClose(): void;
  onRetry(): void;
}) {
  const { data } = useExportStatus(canvasId, jobId);
  const pieces = useEditorStore((s) => s.doc.pieces.length);
  const hasCaptions = useEditorStore((s) => s.doc.captions.length > 0);
  const font = useEditorStore((s) => s.doc.captionStyle.font);
  const fonts = useMemo(() => (hasCaptions ? [captionFont(font).label] : []), [hasCaptions, font]);
  const result = data?.status === "succeeded" ? data.result : null;
  const failed = data?.status === "failed";

  return (
    <Dialog open={jobId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex w-[720px] max-w-[calc(100%-2rem)] flex-col gap-[22px] rounded-[18px] p-7 sm:max-w-[720px]">
        <div className="flex flex-col gap-1.5">
          <DialogTitle className="font-display text-2xl font-semibold">
            {result ? "Your Premiere package is ready" : failed ? "The export didn't finish" : "Preparing your Premiere package"}
          </DialogTitle>
          <DialogDescription className="text-sm tabular-nums text-muted-foreground">
            {result ? exportSubtitle(title, result.summary, pieces) : failed ? data?.error : (data?.phase ?? "Starting…")}
          </DialogDescription>
        </div>

        {!result && !failed && (
          <div className="flex items-center gap-2.5 text-sm">
            <Loader2 className="size-4 animate-spin text-primary" strokeWidth={1.5} />
            {data?.phase ?? "Queued…"}
          </div>
        )}

        {result && (
          <>
            <ul className="m-0 flex list-none flex-col gap-2.5 p-0 text-sm">
              {exportChecklist(result.summary, result.bytes, result.fileName).map((line) => (
                <li key={line} className="flex items-center gap-2.5">
                  <span className="grid size-[22px] place-items-center rounded-full bg-success/15">
                    <Check className="size-[13px] text-success-text" strokeWidth={2} />
                  </span>
                  {line}
                </li>
              ))}
            </ul>
            <div className="grid grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] gap-[18px]">
              <EditorExportHowTo xmlName={result.xmlName} sequenceName={result.sequenceName} />
              <div className="flex flex-col gap-2.5">
                <EditorExportTracks summary={result.summary} dubLabel={dubLabel} />
                {fonts.length > 0 && (
                  <span className="text-xs leading-relaxed text-muted-foreground">
                    Uses {fonts.join(", ")}. Install {fonts.length === 1 ? "it" : "them"} from the package&apos;s fonts folder if Premiere doesn&apos;t have {fonts.length === 1 ? "it" : "them"}.
                  </span>
                )}
              </div>
            </div>
          </>
        )}

        <div className="flex justify-end gap-2.5 border-t border-border pt-[18px]">
          <Button variant="outline" onClick={onClose}>Close</Button>
          {failed && <Button onClick={onRetry}>Try again</Button>}
          {result && (
            <Button nativeButton={false} render={<a href={result.url} download={result.fileName} />} className="min-w-0 gap-2 font-semibold">
              <Download className="size-4 flex-none" strokeWidth={1.5} />
              <span className="truncate">Download {result.fileName}</span>
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
