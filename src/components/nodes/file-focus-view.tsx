"use client";

import { useRef, useState } from "react";
import { ArrowLeft, FileText, Image as ImageIcon, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import type { FileNodeData } from "@/lib/canvas-nodes";
import { FileEmptyState } from "./file-empty-state";

type FileFocusViewProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nodeId: string;
  title: string;
  filename?: string;
  fileExt?: string;
  fileKind?: "text" | "image";
  fileUrl?: string;
  rawText?: string;
  onPatch: (patch: Partial<FileNodeData>) => void;
};

const KIND_LABELS = { text: "TXT", image: "IMG" } as const;

export function FileFocusView({
  open,
  onOpenChange,
  nodeId,
  title,
  filename,
  fileExt,
  fileKind,
  fileUrl,
  rawText,
  onPatch,
}: FileFocusViewProps) {
  const [loading, setLoading] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [confirm, setConfirm] = useState<{
    title: string;
    description: string;
    actionLabel: string;
    onConfirm: () => void;
  } | null>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  const hasFile = !!filename;
  const mode: "loading" | "ready" | "empty" = loading
    ? "loading"
    : hasFile && !replacing
      ? "ready"
      : "empty";

  async function handleUpload(file: File) {
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/nodes/${nodeId}/file`, {
        method: "POST",
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Upload failed");
      onPatch(json as Partial<FileNodeData>);
      setReplacing(false);
      toast.success("File attached");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setLoading(false);
    }
  }

  function handleRemove() {
    setConfirm({
      title: "Remove file?",
      description:
        "This will detach the file from this node. Any downstream nodes using it as a reference will lose the input.",
      actionLabel: "Remove",
      onConfirm: async () => {
        try {
          if (fileKind === "image") {
            await fetch(`/api/nodes/${nodeId}/file`, { method: "DELETE" });
          }
          onPatch({
            filename: undefined,
            fileExt: undefined,
            fileKind: undefined,
            fileUrl: undefined,
            rawText: undefined,
          });
          toast.success("File removed");
        } catch {
          toast.error("Failed to remove file");
        }
      },
    });
  }

  function handleReplaceInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
    e.target.value = "";
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="gap-0 overflow-hidden rounded-t-2xl bg-background data-[side=bottom]:h-[92vh]"
      >
        {/* drag handle */}
        <div className="flex shrink-0 justify-center pt-3">
          <div className="h-1.5 w-12 rounded-full bg-border" />
        </div>

        {/* header */}
        <div className="shrink-0 border-b">
          <div className="mx-auto w-full max-w-5xl px-6 pb-5 pt-3">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="size-4" /> Back to canvas
            </button>

            <header className="mt-4 flex items-start justify-between gap-4">
              <div>
                <SheetTitle className="font-display text-3xl font-semibold tracking-tight">
                  {title || "Untitled file"}
                </SheetTitle>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  {mode === "empty" || mode === "loading"
                    ? "Attach a .txt or image file to use as a reference on the canvas."
                    : filename ?? ""}
                </p>
              </div>

              {mode === "ready" && (
                <div className="flex shrink-0 items-center gap-2">
                  {/* hidden input for Replace */}
                  <input
                    ref={replaceInputRef}
                    type="file"
                    accept=".txt,.png,.jpg,.jpeg,.webp"
                    className="hidden"
                    onChange={handleReplaceInput}
                  />
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={() => replaceInputRef.current?.click()}
                  >
                    <RefreshCw className="size-4 text-primary" /> Replace
                  </Button>
                  <Button variant="outline" size="lg" onClick={handleRemove}>
                    <Trash2 className="size-4 text-destructive" />
                    <span className="text-destructive">Remove</span>
                  </Button>
                </div>
              )}

              {mode === "empty" && replacing && (
                <Button variant="ghost" size="lg" onClick={() => setReplacing(false)}>
                  Cancel
                </Button>
              )}
            </header>
          </div>
        </div>

        {/* body */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-5xl px-6 py-8">
            {mode === "loading" && (
              <div className="flex flex-col items-center justify-center gap-3 py-24 text-muted-foreground">
                <Loader2 className="size-8 animate-spin text-primary" />
                <p className="text-sm">Uploading…</p>
              </div>
            )}

            {mode === "empty" && (
              <FileEmptyState
                title={title}
                onTitleChange={(t) => onPatch({ title: t })}
                onUpload={handleUpload}
              />
            )}

            {mode === "ready" && (
              <FilePreview
                fileKind={fileKind}
                fileUrl={fileUrl}
                rawText={rawText}
                filename={filename}
                fileExt={fileExt}
              />
            )}
          </div>
        </div>
      </SheetContent>

      <AlertDialog
        open={!!confirm}
        onOpenChange={(next) => {
          if (!next) setConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirm?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirm(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                confirm?.onConfirm();
                setConfirm(null);
              }}
            >
              {confirm?.actionLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
}

// ── File preview ──────────────────────────────────────────────────────────────

type FilePreviewProps = {
  fileKind?: "text" | "image";
  fileUrl?: string;
  rawText?: string;
  filename?: string;
  fileExt?: string;
};

function FilePreview({ fileKind, fileUrl, rawText, filename, fileExt }: FilePreviewProps) {
  const kindLabel = fileKind ? KIND_LABELS[fileKind] : null;

  return (
    <div className="flex flex-col gap-5">
      {/* metadata row */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {fileKind === "image" ? (
          <ImageIcon className="size-4 shrink-0" />
        ) : (
          <FileText className="size-4 shrink-0" />
        )}
        <span className="font-medium text-foreground">{filename}</span>
        {kindLabel && (
          <span
            className={cn(
              "rounded-md px-1.5 py-0.5 text-xs font-medium",
              fileKind === "image"
                ? "bg-primary/10 text-primary"
                : "bg-muted text-muted-foreground",
            )}
          >
            {kindLabel}
          </span>
        )}
        {fileExt && <span className="text-xs">.{fileExt}</span>}
      </div>

      {/* preview */}
      {fileKind === "image" && fileUrl && (
        <div className="flex items-center justify-center overflow-hidden rounded-xl border bg-muted/20">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={fileUrl}
            alt={filename ?? "uploaded image"}
            className="max-h-[60vh] w-auto object-contain"
          />
        </div>
      )}

      {fileKind === "text" && (
        <div className="rounded-xl border bg-muted/20">
          {rawText ? (
            <pre className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap break-words p-5 text-sm leading-relaxed text-foreground/80">
              {rawText}
            </pre>
          ) : (
            <p className="p-5 text-sm text-muted-foreground">No text content.</p>
          )}
        </div>
      )}
    </div>
  );
}
