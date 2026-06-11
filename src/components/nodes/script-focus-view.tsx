"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ArrowLeft, Eye, EyeOff, RefreshCw, FileUp } from "lucide-react";
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
import { looksLikeReelScript, type ReelScript } from "@/lib/nodes/reel-script";
import { setScriptValue, addItem, removeItem } from "@/lib/nodes/script-edit";
import type { KBSliceKey } from "@/lib/kb/parse-context";
import { ScriptDocument } from "./script-document";
import { ScriptEmptyState } from "./script-empty-state";
import { ScriptSkeleton } from "./script-skeleton";

type Path = (string | number)[];

type ScriptFocusViewProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nodeId: string;
  title: string;
  source: string;
  parsed: ReelScript | null;
  slices: KBSliceKey[];
  onPatch: (patch: Record<string, unknown>) => void;
  onSaveOutput: (output: ReelScript) => Promise<void>;
};

const SUBTITLES = {
  empty: "Upload a reel brief to extract its structured script.",
  skeleton: "Extracting the script…",
  parsed: "Review and edit the extracted reel script.",
} as const;

// The Script node's surface — a full-width bottom sheet. A three-state machine:
// EMPTY (upload + toggles) → SKELETON (parsing) → PARSED (editable doc).
// Manual edits are buffered in a draft and committed by an explicit Save.
export function ScriptFocusView({
  open,
  onOpenChange,
  nodeId,
  title,
  source,
  parsed,
  slices,
  onPatch,
  onSaveOutput,
}: ScriptFocusViewProps) {
  const [draft, setDraft] = useState<ReelScript>(parsed ?? {});
  const [showOriginal, setShowOriginal] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [seed, setSeed] = useState<{ open: boolean; parsed: ReelScript | null }>({
    open,
    parsed,
  });
  // A pending destructive action awaiting confirmation. Replaces window.confirm
  // so the prompt stays inside the design system instead of native OS chrome.
  const [confirm, setConfirm] = useState<{
    title: string;
    description: string;
    actionLabel: string;
    onConfirm: () => void;
  } | null>(null);

  // Reseed the draft from the saved script when the view opens or a fresh parse
  // lands. Adjusting state during render is React's documented alternative to a
  // reset effect (https://react.dev/learn/you-might-not-need-an-effect).
  if (seed.open !== open || seed.parsed !== parsed) {
    setSeed({ open, parsed });
    setDraft(parsed ?? {});
    if (parsed) setReplacing(false);
  }

  const hasParsed = !!parsed && looksLikeReelScript(parsed as Record<string, unknown>);
  const mode: "skeleton" | "parsed" | "empty" = parsing
    ? "skeleton"
    : hasParsed && !replacing
      ? "parsed"
      : "empty";

  const dirty = hasParsed && JSON.stringify(draft) !== JSON.stringify(parsed);

  async function runParse(src: string) {
    if (!src.trim()) return;
    setParsing(true);
    try {
      const res = await fetch(`/api/nodes/${nodeId}/parse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: src, slices }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(
          res.status === 404
            ? "Node is still saving — wait a second and retry."
            : (json.error ?? "Extraction failed"),
        );
      }
      onPatch({ parsed: json.output });
      setReplacing(false);
      toast.success("Script extracted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Extraction failed");
    } finally {
      setParsing(false);
    }
  }

  async function handleSave() {
    try {
      await onSaveOutput(draft);   // truth: update the active version's output
      onPatch({ parsed: draft });  // mirror into the store for display + clear dirty
      toast.success("Saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  }

  function toggleSlice(key: KBSliceKey) {
    const next = slices.includes(key)
      ? slices.filter((k) => k !== key)
      : [...slices, key];
    onPatch({ kbSlices: next });
  }

  function requestClose() {
    if (dirty) {
      setConfirm({
        title: "Discard unsaved changes?",
        description:
          "You have edits that haven't been saved. Closing now will discard them.",
        actionLabel: "Discard",
        onConfirm: () => onOpenChange(false),
      });
      return;
    }
    onOpenChange(false);
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (next) onOpenChange(true);
        else requestClose();
      }}
    >
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
              onClick={requestClose}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="size-4" /> Back to canvas
            </button>

            <header className="mt-4 flex items-start justify-between gap-4">
              <div>
                <SheetTitle className="font-display text-3xl font-semibold tracking-tight">
                  {title || "Reel script"}
                </SheetTitle>
                <p className="mt-1.5 text-sm text-muted-foreground">{SUBTITLES[mode]}</p>
              </div>

              {mode === "parsed" && (
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    variant="ghost"
                    size="lg"
                    onClick={() => setShowOriginal((v) => !v)}
                  >
                    {showOriginal ? (
                      <>
                        <EyeOff className="size-4" /> Hide original
                      </>
                    ) : (
                      <>
                        <Eye className="size-4" /> Show original
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={() => {
                      if (!dirty) {
                        runParse(source);
                        return;
                      }
                      setConfirm({
                        title: "Re-extract the script?",
                        description:
                          "Re-extracting will overwrite your unsaved edits with a fresh extraction.",
                        actionLabel: "Re-extract",
                        onConfirm: () => runParse(source),
                      });
                    }}
                  >
                    <RefreshCw className="size-4 text-primary" /> Re-extract
                  </Button>
                  <Button variant="outline" size="lg" onClick={() => setReplacing(true)}>
                    <FileUp className="size-4 text-primary" /> Replace script
                  </Button>
                  <div className="mx-1 h-6 w-px bg-border" aria-hidden />
                  {dirty && (
                    <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[0.65rem] font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-400">
                      Unsaved changes
                    </span>
                  )}
                  <Button size="lg" onClick={handleSave} disabled={!dirty}>
                    Save
                  </Button>
                </div>
              )}

              {mode === "empty" && replacing && hasParsed && (
                <Button variant="ghost" size="lg" onClick={() => setReplacing(false)}>
                  Cancel
                </Button>
              )}
            </header>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-5xl px-6 py-8">
            {mode === "skeleton" && <ScriptSkeleton />}

            {mode === "empty" && (
              <ScriptEmptyState
                title={title}
                slices={slices}
                onTitleChange={(t) => onPatch({ title: t })}
                onToggleSlice={toggleSlice}
                onUpload={(s) => {
                  onPatch({ source: s });
                  runParse(s);
                }}
              />
            )}

            {mode === "parsed" && (
              <>
                <AnimatePresence initial={false}>
                  {showOriginal && (
                    <motion.div
                      key="original"
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 8 }}
                      transition={{ ease: [0.22, 1, 0.36, 1], duration: 0.32 }}
                      className="mb-6 rounded-xl border bg-muted/20 p-5"
                    >
                      <span className="text-eyebrow">Original script</span>
                      <pre className="mt-3 max-h-[60vh] overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-foreground/80">
                        {source || "No original script."}
                      </pre>
                    </motion.div>
                  )}
                </AnimatePresence>
                <ScriptDocument
                  script={draft}
                  onChange={(path: Path, value) =>
                    setDraft((dd) => setScriptValue(dd, path, value))
                  }
                  onAddItem={(path: Path, item) =>
                    setDraft((dd) => addItem(dd, path, item))
                  }
                  onRemoveItem={(path: Path, index) =>
                    setDraft((dd) => removeItem(dd, path, index))
                  }
                />
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
  );
}
