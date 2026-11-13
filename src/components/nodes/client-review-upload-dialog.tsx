"use client";

import { useRef, useState, type DragEvent } from "react";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { useFlushAutosave } from "@/components/canvas/autosave-flush-context";
import { useCanvasStoreApi } from "@/components/canvas/canvas-store-provider";
import { titleFromFilename } from "@/lib/nodes/title";
import { CUT_CONTENT_TYPES, CUT_EXTENSIONS, CUT_MAX_BYTES } from "@/lib/client-review/constants";
import { cutExtension } from "@/lib/client-review/validate";
import { uploadViaSignedUrl } from "@/lib/uploads/client";
import type { NodeClientReview } from "@/lib/client-review/wire";

const ACCEPT = [...CUT_EXTENSIONS].map((e) => `.${e}`).join(",");
const SWITCH_ID = "client-review-upload-download";

// D495/D497 — upload a cut as the node's next version: the file and its Allow download switch
// (on unless turned off here). The bytes go straight to storage; the finalize call records the
// version and returns the node's whole review, which the caller writes into the query cache.
export function ClientReviewUploadDialog({
  nodeId,
  open,
  onOpenChange,
  nextVersionNo,
  onUploaded,
}: {
  nodeId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nextVersionNo: number;
  onUploaded: (next: NodeClientReview, versionNo: number) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [allowDownload, setAllowDownload] = useState(true);
  const [uploading, setUploading] = useState(false);
  // Percent of bytes sent; null before the PUT starts. 100 = bytes done, now "Finishing…".
  const [percent, setPercent] = useState<number | null>(null);
  const flushAutosave = useFlushAutosave();
  const store = useCanvasStoreApi();
  const label = `v${nextVersionNo}`;

  function reset() {
    setFile(null);
    setAllowDownload(true);
    setPercent(null);
  }

  function pick(f: File | undefined) {
    if (!f) return;
    if (f.size > CUT_MAX_BYTES) {
      toast.error("The cut is over 500 MB. Export a smaller file.");
      return;
    }
    if (!cutExtension(f.name)) {
      toast.error(`Upload a video: ${ACCEPT.replaceAll(",", ", ")}.`);
      return;
    }
    setFile(f);
  }

  // Each version is named after its file (the server stores it on the version); the node card
  // shows the newest version, so the node takes the new name too.
  function nameAfterCut(filename: string) {
    const title = titleFromFilename(filename);
    if (title) store.getState().updateNodeData(nodeId, { title });
  }

  async function upload() {
    if (!file) return;
    // Some browsers report an empty type for .mov; the sign route needs a video/* type.
    const ext = cutExtension(file.name);
    const contentType = file.type || (ext ? CUT_CONTENT_TYPES[ext] : undefined);
    setUploading(true);
    setPercent(null);
    try {
      // The node row must exist before /api/nodes/:id/* can find it (600ms autosave lag).
      await flushAutosave();
      const next = await uploadViaSignedUrl<NodeClientReview>(file, {
        signEndpoint: `/api/nodes/${nodeId}/client-review/sign`,
        finalizeEndpoint: `/api/nodes/${nodeId}/client-review`,
        finalizeBody: { allowDownload },
        contentType,
        onProgress: setPercent,
      });
      // Save the title before the header's feedback list refetches (it reads saved titles). A
      // failed save must not report the successful upload as failed; autosave retries it.
      nameAfterCut(file.name);
      await flushAutosave().catch(() => {});
      onUploaded(next, nextVersionNo);
      reset();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
      setPercent(null);
    }
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    pick(e.dataTransfer.files[0]);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (uploading) return; // the upload would finish unseen
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="overflow-hidden sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">
            {nextVersionNo === 1 ? "Upload the first cut" : `Upload ${label}`}
          </DialogTitle>
          <DialogDescription>
            {nextVersionNo === 1
              ? "It gets its own link to send to the client."
              : `${label} gets its own new link. Earlier links keep showing their own cut.`}
          </DialogDescription>
        </DialogHeader>

        <div className="min-w-0" onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}>
          <Button
            variant="ghost"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            className="h-auto w-full min-w-0 flex-col gap-1.5 overflow-hidden border border-dashed border-primary/40 px-4 py-6 text-primary hover:bg-primary/5 hover:text-primary"
          >
            <Upload className="size-5" strokeWidth={1.5} />
            {/* A long file name stays on one line, cut with "…"; the full name is its tooltip. */}
            <span className="block w-full truncate text-center" title={file?.name}>
              {file ? file.name : "Choose or drop a video"}
            </span>
            <span className="text-xs font-normal text-muted-foreground">.mp4, .mov or .webm</span>
          </Button>
          <Input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              pick(f);
            }}
          />
        </div>

        <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
          <Label htmlFor={SWITCH_ID} className="flex flex-col items-start gap-0.5">
            <span className="text-sm font-medium">Allow download</span>
            <span className="text-xs font-normal text-muted-foreground">
              {allowDownload ? "The client sees a Download video button." : "The client can watch and comment only."}
            </span>
          </Label>
          <Switch id={SWITCH_ID} checked={allowDownload} disabled={uploading} onCheckedChange={(v) => setAllowDownload(Boolean(v))} />
        </div>

        {uploading && (
          <Progress value={percent ?? 0} className="gap-1.5">
            <ProgressLabel className="text-xs font-medium text-primary">
              {percent === null ? "Preparing…" : percent >= 100 ? "Finishing…" : "Uploading…"}
            </ProgressLabel>
            <ProgressValue className="text-xs" />
          </Progress>
        )}

        <DialogFooter>
          <Button variant="ghost" disabled={uploading} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!file || uploading} onClick={() => void upload()}>
            {`Add as ${label}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
