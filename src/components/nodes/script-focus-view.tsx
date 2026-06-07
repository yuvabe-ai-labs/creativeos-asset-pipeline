"use client";

import { useState } from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import {
  ArrowLeft,
  PanelLeftOpen,
  PanelLeftClose,
  RefreshCw,
  FileUp,
} from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogPortal, DialogOverlay, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
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
};

// The Script node's full-screen surface. A three-state machine:
// EMPTY (upload/paste + toggles) → SKELETON (parsing) → PARSED (editable doc).
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
}: ScriptFocusViewProps) {
  const [draft, setDraft] = useState<ReelScript>(parsed ?? {});
  const [showOriginal, setShowOriginal] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [seed, setSeed] = useState<{ open: boolean; parsed: ReelScript | null }>({
    open,
    parsed,
  });

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

  function toggleSlice(key: KBSliceKey) {
    const next = slices.includes(key)
      ? slices.filter((k) => k !== key)
      : [...slices, key];
    onPatch({ kbSlices: next });
  }

  function requestClose() {
    if (dirty && !window.confirm("Discard unsaved changes?")) return;
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) onOpenChange(true);
        else requestClose();
      }}
    >
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Popup className="fixed inset-0 z-50 flex flex-col bg-background outline-none data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0">
          <header className="flex items-center justify-between border-b px-5 py-3">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={requestClose}>
                <ArrowLeft className="size-4" /> Back
              </Button>
              <DialogTitle className="font-display text-lg">
                {title || "Reel script"}
              </DialogTitle>
              {mode === "skeleton" && (
                <span className="text-xs text-muted-foreground">Extracting…</span>
              )}
              {dirty && (
                <span className="text-xs text-muted-foreground">Unsaved changes</span>
              )}
            </div>

            {mode === "parsed" && (
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setShowOriginal((v) => !v)}>
                  {showOriginal ? (
                    <>
                      <PanelLeftClose className="size-4" /> Hide original
                    </>
                  ) : (
                    <>
                      <PanelLeftOpen className="size-4" /> Show original
                    </>
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (!dirty || window.confirm("Re-extract will overwrite unsaved edits. Continue?")) {
                      runParse(source);
                    }
                  }}
                >
                  <RefreshCw className="size-4" /> Re-extract
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setReplacing(true)}>
                  <FileUp className="size-4" /> Replace script
                </Button>
                <Button size="sm" onClick={() => onPatch({ parsed: draft })} disabled={!dirty}>
                  Save
                </Button>
              </div>
            )}

            {mode === "empty" && replacing && hasParsed && (
              <Button variant="ghost" size="sm" onClick={() => setReplacing(false)}>
                Cancel
              </Button>
            )}
          </header>

          <div className="flex min-h-0 flex-1">
            {mode === "parsed" && showOriginal && (
              <aside className="w-80 shrink-0 overflow-y-auto border-r bg-muted/20 p-5">
                <span className="text-eyebrow">Original script</span>
                <pre className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                  {source || "No original script."}
                </pre>
              </aside>
            )}
            <main className="flex-1 overflow-y-auto">
              {mode === "skeleton" && <ScriptSkeleton />}
              {mode === "empty" && (
                <ScriptEmptyState
                  title={title}
                  source={source}
                  slices={slices}
                  onTitleChange={(t) => onPatch({ title: t })}
                  onSourceChange={(s) => onPatch({ source: s })}
                  onToggleSlice={toggleSlice}
                  onSubmit={(s) => runParse(s)}
                />
              )}
              {mode === "parsed" && (
                <div className="mx-auto max-w-2xl px-6 py-10">
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
                </div>
              )}
            </main>
          </div>
        </DialogPrimitive.Popup>
      </DialogPortal>
    </Dialog>
  );
}
