"use client";

import { useRef, useState } from "react";
import { ArrowLeft, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
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
import { fileNodeService } from "@/services/file-node.service";
import { FileEmptyState } from "./file-empty-state";
import { EditableField } from "./editable-field";
import { FilePreview } from "./file-preview";
import { LlmToggleRow } from "./file-llm-toggle-row";
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
  useLlm,
  llmPrompt,
  processedOutput,
  onPatch,
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
    try {
      const result = await fileNodeService.upload(nodeId, file);
      onPatch(result);
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
      onPatch({ processedOutput: result.processedOutput });
      toast.success("Extracted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Extraction failed");
    } finally {
      setExtracting(false);
    }
  }

  function handleReplaceInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
    e.target.value = "";
  }

  return (
    <TooltipProvider>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="gap-0 overflow-hidden rounded-t-2xl bg-background data-[side=bottom]:h-[92vh]"
        >
          <div className="flex shrink-0 justify-center pt-3">
            <div className="h-1.5 w-12 rounded-full bg-border" />
          </div>

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
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    {mode === "empty" || mode === "loading"
                      ? "Attach a .txt, image, .pdf, or .docx file to use as a reference on the canvas."
                      : (filename ?? "")}
                  </p>
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
                <FileEmptyState onUpload={handleUpload} />
              )}

              {mode === "ready" && (
                <>
                  <LlmToggleRow
                    useLlm={useLlm ?? false}
                    onToggle={(v) => onPatch({ useLlm: v })}
                  />

                  <AnimatePresence initial={false}>
                    {useLlm ? (
                      <motion.div
                        key="llm-on"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ ease: [0.22, 1, 0.36, 1], duration: 0.2 }}
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
                            onPromptBlur={() =>
                              onPatch({ llmPrompt: localPrompt })
                            }
                            onExtract={handleExtract}
                          />
                        </div>
                      </motion.div>
                    ) : (
                      <motion.div
                        key="llm-off"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ ease: [0.22, 1, 0.36, 1], duration: 0.2 }}
                        className="flex-1 min-h-0 flex flex-col"
                      >
                        <FilePreview
                          fileKind={fileKind}
                          fileUrl={fileUrl}
                          rawText={rawText}
                          filename={filename}
                          fileExt={fileExt}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </>
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
