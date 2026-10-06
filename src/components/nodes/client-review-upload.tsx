"use client";

import { useRef, useState, type DragEvent } from "react";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFlushAutosave } from "@/components/canvas/autosave-flush-context";
import { useCanvasEditable } from "@/components/canvas/canvas-editable-context";
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
  const flushAutosave = useFlushAutosave();
  const editable = useCanvasEditable();

  async function upload(file: File) {
    if (file.size > CUT_MAX_BYTES) {
      toast.error("The cut is over 500 MB. Export a smaller file.");
      return;
    }
    // Some browsers report an empty type for .mov; the sign route needs a video/* type.
    const ext = cutExtension(file.name);
    const typed =
      file.type || !ext ? file : new File([file], file.name, { type: CUT_CONTENT_TYPES[ext] });
    setUploading(true);
    try {
      // The node row must exist before /api/nodes/:id/* can find it (600ms autosave lag).
      await flushAutosave();
      const next = await uploadViaSignedUrl<NodeClientReview>(typed, {
        signEndpoint: `/api/nodes/${nodeId}/client-review/sign`,
        finalizeEndpoint: `/api/nodes/${nodeId}/client-review`,
      });
      onUploaded(next);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
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
    <div onDragOver={(e) => e.preventDefault()} onDrop={handleDrop} className="nodrag">
      <Button
        variant="ghost"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        className="w-full gap-1.5 border border-dashed border-primary/40 text-primary hover:bg-primary/5 hover:text-primary"
      >
        <Upload className="size-4" strokeWidth={1.5} />
        {uploading ? "Uploading…" : "Upload edited cut"}
      </Button>
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
