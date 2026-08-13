"use client";

import { useCallback, useRef, useState } from "react";
import { ArrowLeft, Loader2, RefreshCw, Trash2 } from "lucide-react";
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
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { FileNodeData } from "@/lib/canvas-nodes";
import { nextFileNodeTitle } from "@/lib/nodes/title";
import { fileNodeService } from "@/services/file-node.service";
import { useGooglePicker } from "@/hooks/use-google-picker";
import { DriveIcon } from "@/components/ui/drive-icon";
import { FileEmptyState } from "./file-empty-state";
import { EditableField } from "./editable-field";
import { FilePreview } from "./file-preview";
import { LlmPromptPanel } from "./file-llm-prompt-panel";
import { Textarea } from "../ui/textarea";

type FileFocusViewProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nodeId: string;
  title: string;
  filename?: string;
  fileExt?: string;
  fileKind?: "text" | "image" | "document";
  fileUrl?: string;
  rawText?: string;
  useLlm?: boolean;
  llmPrompt?: string;
  processedOutput?: string;
  onPatch: (patch: Partial<FileNodeData>) => void;
  onUploadingChange?: (uploading: boolean) => void;
};

type ConfirmState = {
  title: string;
  description: string;
  actionLabel: string;
  onConfirm: () => void;
};

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
  llmPrompt,
  processedOutput,
  onPatch,
  onUploadingChange,
}: FileFocusViewProps) {
  const [loading, setLoading] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [localPrompt, setLocalPrompt] = useState(llmPrompt ?? "");
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  const hasFile = !!filename;
  const mode: "loading" | "ready" | "empty" = loading
    ? "loading"
    : hasFile && !replacing
      ? "ready"
      : "empty";

  async function handleUpload(file: File) {
    setLoading(true);
    onUploadingChange?.(true);
    try {
      const result = await fileNodeService.upload(nodeId, file);
      onPatch(result);
      // `title`/`filename` are this render's props — i.e. the state BEFORE the patch above —
      // which is exactly what the rule needs to tell an auto-derived title from a typed one.
      const nextTitle = nextFileNodeTitle({
        currentTitle: title,
        previousFilename: filename,
        nextFilename: result.filename ?? file.name,
      });
      if (nextTitle !== null) onPatch({ title: nextTitle });
      setReplacing(false);
      toast.success("File attached");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setLoading(false);
      onUploadingChange?.(false);
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
          if (fileKind === "image" || fileKind === "document") {
            await fileNodeService.remove(nodeId);
          }
          onPatch({
            filename: undefined,
            fileExt: undefined,
            fileKind: undefined,
            fileUrl: undefined,
            rawText: undefined,
            processedOutput: undefined,
          });
          toast.success("File removed");
        } catch {
          toast.error("Failed to remove file");
        }
      },
    });
  }

  async function handleExtract() {
    if (!fileKind) return;
    setExtracting(true);
    try {
      const result = await fileNodeService.extract(nodeId, localPrompt, {
        fileKind,
        rawText,
        fileUrl,
      });
      onPatch({ processedOutput: result.processedOutput, useLlm: true });
      toast.success("Extracted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Extraction failed");
    } finally {
      setExtracting(false);
    }
  }

  function handleClearLlm() {
    setConfirm({
      title: "Clear prompt & result?",
      description: "This will erase your extraction prompt and any extracted output.",
      actionLabel: "Clear",
      onConfirm: () => {
        setLocalPrompt("");
        onPatch({ useLlm: false, llmPrompt: "", processedOutput: "" });
      },
    });
  }

  function handleReplaceInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
    e.target.value = "";
  }

  const { openPicker } = useGooglePicker(async (driveFile) => {
    setLoading(true);
    onUploadingChange?.(true);
    try {
      const result = await fileNodeService.pickFromDrive(nodeId, driveFile);
      onPatch(result);
      // Same rule as the upload path — importing from Drive replaces the attachment too.
      const nextTitle = nextFileNodeTitle({
        currentTitle: title,
        previousFilename: filename,
        nextFilename: result.filename ?? driveFile.driveFileName,
      });
      if (nextTitle !== null) onPatch({ title: nextTitle });
      setReplacing(false);
      toast.success("File imported from Google Drive");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to import from Google Drive");
    } finally {
      setLoading(false);
      onUploadingChange?.(false);
    }
  });

  const handleOpenPicker = useCallback(async () => {
    try {
      await openPicker();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open Google Drive");
    }
  }, [openPicker]);

  return (
    <TooltipProvider>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="gap-0 overflow-hidden rounded-t-2xl bg-background data-[side=bottom]:h-[92vh]"
        >
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
                  <SheetTitle className="p-0 font-display text-3xl font-semibold tracking-tight">
                    <EditableField
                      value={title || ""}
                      onCommit={(t) => onPatch({ title: t })}
                      placeholder="Untitled file"
                      className="font-display text-3xl font-semibold tracking-tight"
                    />
                  </SheetTitle>
                  {mode !== "empty" && mode !== "loading" && filename && (
                    <p className="mt-1.5 text-sm text-muted-foreground">{filename}</p>
                  )}
                </div>

                {mode === "ready" && (
                  <div className="flex shrink-0 items-center gap-2">
                    <input
                      ref={replaceInputRef}
                      type="file"
                      accept=".txt,.png,.jpg,.jpeg,.webp,.pdf,.docx"
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
                    <button
                      type="button"
                      onClick={handleOpenPicker}
                      disabled={replacing || loading}
                      className="inline-flex h-11 items-center gap-2.5 rounded-lg border border-neutral-200 bg-white px-4 text-sm font-medium text-neutral-700 shadow-sm transition-all hover:bg-neutral-50 hover:shadow disabled:pointer-events-none disabled:opacity-50 active:scale-[0.99]"
                    >
                      <DriveIcon size={16} />
                      Replace from Drive
                    </button>
                    <Button variant="outline" size="lg" onClick={handleRemove}>
                      <Trash2 className="size-4 text-destructive" />
                      <span className="text-destructive">Remove</span>
                    </Button>
                  </div>
                )}

                {mode === "empty" && replacing && (
                  <Button
                    variant="ghost"
                    size="lg"
                    onClick={() => setReplacing(false)}
                  >
                    Cancel
                  </Button>
                )}
              </header>
            </div>
          </div>

          <div className="min-h-0 flex-1 flex flex-col">
            <div className="mx-auto w-full max-w-5xl px-6 py-6 flex-1 min-h-0 flex flex-col">
              {mode === "loading" && (
                <div className="flex flex-col items-center justify-center gap-3 py-24 text-muted-foreground">
                  <Loader2 className="size-8 animate-spin text-primary" />
                  <p className="text-sm">Uploading…</p>
                </div>
              )}

              {mode === "empty" && (
                <FileEmptyState onUpload={handleUpload} onPickFromDrive={handleOpenPicker} />
              )}

              {mode === "ready" && (
                <div
                  className={cn(
                    "flex-1 min-h-0 grid gap-8 h-full",
                    fileKind === "document"
                      ? "grid-cols-[2fr_3fr]"
                      : "grid-cols-[3fr_2fr]",
                  )}
                >
                  <div className="flex flex-col min-h-0">
                    <FilePreview
                      fileKind={fileKind}
                      fileUrl={fileUrl}
                      rawText={rawText}
                      filename={filename}
                      fileExt={fileExt}
                    />
                  </div>
                  <div className="flex flex-col min-h-0">
                    <LlmPromptPanel
                      localPrompt={localPrompt}
                      processedOutput={processedOutput}
                      extracting={extracting}
                      onPromptChange={setLocalPrompt}
                      onPromptBlur={() => onPatch({ llmPrompt: localPrompt })}
                      onExtract={handleExtract}
                      onClear={handleClearLlm}
                    />
                  </div>
                </div>
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
              <AlertDialogDescription>
                {confirm?.description}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setConfirm(null)}>
                Cancel
              </AlertDialogCancel>
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
    </TooltipProvider>
  );
}
