"use client";

import { useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  Copy,
  FileText,
  Image as ImageIcon,
  Info,
  Loader2,
  RefreshCw,
  Sparkles,
  Trash2,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
import { fileNodeService } from "@/services/file-node.service";
import { FileEmptyState } from "./file-empty-state";
import { EditableField } from "./editable-field";

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

const KIND_LABELS = { text: "TXT", image: "IMG", document: "DOC" } as const;

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
                      : filename ?? ""}
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
                  <Button variant="ghost" size="lg" onClick={() => setReplacing(false)}>
                    Cancel
                  </Button>
                )}
              </header>
            </div>
          </div>

          {/* body — flex column, no outer scroll */}
          <div className="min-h-0 flex-1 flex flex-col">
            <div className="mx-auto w-full max-w-5xl px-6 py-6 flex-1 min-h-0 flex flex-col">
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
                <>
                  {/* LLM toggle — shrink-0 so it never steals height from content */}
                  <LlmToggleRow
                    useLlm={useLlm ?? false}
                    onToggle={(v) => onPatch({ useLlm: v })}
                  />

                  {/* Content area fills remaining height */}
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
                            onPromptBlur={() => onPatch({ llmPrompt: localPrompt })}
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
    </TooltipProvider>
  );
}

// ── LLM toggle row ────────────────────────────────────────────────────────────

function LlmToggleRow({
  useLlm,
  onToggle,
}: {
  useLlm: boolean;
  onToggle: (v: boolean) => void;
}) {
  return (
    <div className="shrink-0 mb-4">
      <div className="h-px bg-border" />
      <div className="flex items-center gap-2.5 py-3">
        <Sparkles className="size-4 text-primary shrink-0" />

        {/* toggle inline with label */}
        <button
          type="button"
          aria-pressed={useLlm}
          onClick={() => onToggle(!useLlm)}
          className={cn(
            "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            useLlm ? "bg-primary" : "bg-input",
          )}
        >
          <span
            className={cn(
              "pointer-events-none inline-block size-4 rounded-full bg-background shadow-lg ring-0 transition-transform",
              useLlm ? "translate-x-4" : "translate-x-0",
            )}
          />
        </button>

        <span className="text-sm font-medium">Use LLM</span>

        {/* info tooltip */}
        <Tooltip>
          <TooltipTrigger
            className="inline-flex items-center text-muted-foreground/60 hover:text-muted-foreground transition-colors"
            aria-label="About LLM extraction"
          >
            <Info className="size-3.5" />
          </TooltipTrigger>
          <TooltipContent>
            Uses AI to extract specific information from your file. Write a prompt
            describing what you want — the result is saved to this node and can be
            referenced by other nodes.
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

// ── LLM prompt panel (right column when enabled) ──────────────────────────────

type LlmPromptPanelProps = {
  localPrompt: string;
  processedOutput?: string;
  extracting: boolean;
  onPromptChange: (v: string) => void;
  onPromptBlur: () => void;
  onExtract: () => void;
};

function LlmPromptPanel({
  localPrompt,
  processedOutput,
  extracting,
  onPromptChange,
  onPromptBlur,
  onExtract,
}: LlmPromptPanelProps) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    if (!processedOutput) return;
    navigator.clipboard.writeText(processedOutput);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-col gap-4 h-full min-h-0">
      {/* prompt area — shrink-0 so it never competes with result for height */}
      <div className="shrink-0 flex flex-col gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Extraction prompt
        </p>
        <Textarea
          value={localPrompt}
          onChange={(e) => onPromptChange(e.target.value)}
          onBlur={onPromptBlur}
          placeholder="What do you want to extract? e.g. 'List all product names mentioned'"
          rows={4}
          className="resize-none"
        />
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            onClick={onExtract}
            disabled={!localPrompt.trim() || extracting}
          >
            {extracting ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Sparkles className="size-3.5" />
            )}
            {processedOutput ? "Re-extract" : "Extract"}
          </Button>
          {extracting && (
            <span className="text-xs text-muted-foreground">Running extraction…</span>
          )}
        </div>
      </div>

      {/* divider */}
      <div className="shrink-0 h-px bg-border" />

      {/* result area — flex-1 so it fills remaining column height */}
      <div className="flex-1 min-h-0 flex flex-col gap-2">
        <div className="shrink-0 flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Result
          </p>
          {processedOutput && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleCopy}
              aria-label="Copy result"
            >
              {copied ? (
                <Check className="size-3.5 text-primary" />
              ) : (
                <Copy className="size-3.5" />
              )}
            </Button>
          )}
        </div>

        {processedOutput ? (
          <div className="flex-1 min-h-0 rounded-xl border bg-muted/20 overflow-hidden">
            <pre className="h-full overflow-y-auto whitespace-pre-wrap wrap-break-word p-4 text-sm leading-relaxed text-foreground/80">
              {processedOutput}
            </pre>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Run extraction to see results here.
          </p>
        )}
      </div>
    </div>
  );
}

// ── File preview ──────────────────────────────────────────────────────────────

type FilePreviewProps = {
  fileKind?: "text" | "image" | "document";
  fileUrl?: string;
  rawText?: string;
  filename?: string;
  fileExt?: string;
};

function FilePreview({ fileKind, fileUrl, rawText, filename, fileExt }: FilePreviewProps) {
  const kindLabel = fileKind ? KIND_LABELS[fileKind] : null;

  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      {/* metadata row */}
      <div className="shrink-0 flex items-center gap-2 text-sm text-muted-foreground">
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

      {/* preview — fills remaining height with own scroll */}
      {fileKind === "image" && fileUrl && (
        <div className="flex-1 min-h-0 flex items-center justify-center overflow-hidden rounded-xl border bg-muted/20">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={fileUrl}
            alt={filename ?? "uploaded image"}
            className="max-h-full w-auto object-contain"
          />
        </div>
      )}

      {fileKind === "text" && (
        <div className="flex-1 min-h-0 rounded-xl border bg-muted/20 overflow-hidden">
          {rawText ? (
            <pre className="h-full overflow-y-auto whitespace-pre-wrap wrap-break-word p-5 text-sm leading-relaxed text-foreground/80">
              {rawText}
            </pre>
          ) : (
            <p className="p-5 text-sm text-muted-foreground">No text content.</p>
          )}
        </div>
      )}

      {fileKind === "document" && (
        <div className="flex items-center gap-3 rounded-xl border bg-muted/20 p-5">
          <FileText className="size-8 shrink-0 text-muted-foreground" />
          <div>
            <p className="font-medium">{filename}</p>
            <p className="text-xs text-muted-foreground">
              Document preview not available — use the LLM toggle above to extract content.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
