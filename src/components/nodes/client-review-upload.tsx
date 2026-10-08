"use client";

import { useRef, useState, type DragEvent } from "react";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress";
import { useFlushAutosave } from "@/components/canvas/autosave-flush-context";
import { useCanvasEditable } from "@/components/canvas/canvas-editable-context";
import { useCanvasStoreApi } from "@/components/canvas/canvas-store-provider";
import type { ClientReviewNodeData } from "@/lib/canvas-nodes";
import { titleFromFilename, uniqueTitle } from "@/lib/nodes/title";
import { CUT_CONTENT_TYPES, CUT_EXTENSIONS, CUT_MAX_BYTES } from "@/lib/client-review/constants";
import { cutExtension } from "@/lib/client-review/validate";
import { uploadViaSignedUrl } from "@/lib/uploads/client";
import type { NodeClientReview } from "@/lib/client-review/wire";

const ACCEPT = [...CUT_EXTENSIONS].map((e) => `.${e}`).join(",");

// Dashed primary chip (design-system "add" action) that also takes a dropped file.
export function ClientReviewUpload({
  nodeId,
  onUploaded,
}: {
  nodeId: string;
  onUploaded: (next: NodeClientReview) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  // Percent of bytes sent to GCS; null before the PUT starts. 100 = bytes done, the
  // server is now recording the cut ("Finishing…").
  const [percent, setPercent] = useState<number | null>(null);
  const flushAutosave = useFlushAutosave();
  const editable = useCanvasEditable();
  const store = useCanvasStoreApi();

  // The node takes the cut's file name, replacing whatever it carried before (a duplicated
  // node arrives with its source's title). If another Client review node on the canvas
  // already has that name, it is numbered "(1)", "(2)", … so the feedback list stays readable.
  function nameAfterFile(filename: string) {
    const { nodes, updateNodeData } = store.getState();
    const taken = nodes
      .filter((n) => n.type === "client-review" && n.id !== nodeId)
      .map((n) => (n.data as ClientReviewNodeData).title ?? "");
    const title = uniqueTitle(titleFromFilename(filename), taken);
    if (title) updateNodeData(nodeId, { title });
  }

  async function upload(file: File) {
    if (file.size > CUT_MAX_BYTES) {
      toast.error("The cut is over 500 MB. Export a smaller file.");
      return;
    }
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
        contentType,
        onProgress: setPercent,
      });
      // Rename and save BEFORE onUploaded: it refetches the header's feedback list, which
      // reads titles from the saved node, so it would otherwise show the old name. A failed
      // save must not report the (successful) upload as failed; autosave retries the title.
      nameAfterFile(file.name);
      await flushAutosave().catch(() => {});
      onUploaded(next);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
      setPercent(null);
    }
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files[0];
    if (file) void upload(file);
  }

  if (!editable) return null;

  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
      onDoubleClick={(e) => e.stopPropagation()}
      className="nodrag"
    >
      {uploading ? (
        // Determinate once bytes are moving; before the PUT starts (sign request) and after
        // it ends (finalize) the label says which phase it is in.
        <Progress value={percent ?? 0} className="gap-1.5 px-1 py-1.5">
          <ProgressLabel className="text-xs font-medium text-primary">
            {percent === null ? "Preparing…" : percent >= 100 ? "Finishing…" : "Uploading…"}
          </ProgressLabel>
          <ProgressValue className="text-xs" />
        </Progress>
      ) : (
        <Button
          variant="ghost"
          onClick={() => inputRef.current?.click()}
          className="w-full gap-1.5 border border-dashed border-primary/40 text-primary hover:bg-primary/5 hover:text-primary"
        >
          <Upload className="size-4" strokeWidth={1.5} />
          Upload edited cut
        </Button>
      )}
      <Input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void upload(file);
        }}
      />
    </div>
  );
}
