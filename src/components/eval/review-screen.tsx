"use client";

import { useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight, ListChecks } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { setVersionLabelAction } from "@/lib/actions/eval";
import { TracePanels } from "./trace-panels";
import { LabelBar } from "./label-bar";
import type { EvalTrace } from "@/lib/db/eval";

type Decision = "pass" | "fail" | null;

// Step-3 open-coding surface (layout B). One trace per screen: read shot + prompt, mark
// pass/fail, note, save & next. Source-agnostic — takes a traces[] list (here the eval
// canvas; production swaps the query feeding it). Keys: p/f, ←/→, ↵ = save & next.
export function ReviewScreen({ traces: initial }: { canvasId: string; traces: EvalTrace[] }) {
  const [traces, setTraces] = useState(initial);
  const [index, setIndex] = useState(0);
  const [saving, setSaving] = useState(false);

  const current = traces[index];
  const [decision, setDecision] = useState<Decision>(current?.decision ?? null);
  const [note, setNote] = useState(current?.note ?? "");

  // Re-seed the drafts when the visible trace changes (derive-state-on-render pattern).
  const [seedIdx, setSeedIdx] = useState(index);
  if (seedIdx !== index) {
    setSeedIdx(index);
    setDecision(traces[index]?.decision ?? null);
    setNote(traces[index]?.note ?? "");
  }

  const total = traces.length;
  const labelled = traces.filter((t) => t.decision).length;

  const go = useCallback(
    (delta: number) => setIndex((i) => Math.min(total - 1, Math.max(0, i + delta))),
    [total],
  );

  const save = useCallback(
    async (advance: boolean) => {
      if (!current) return;
      const trimmed = note.trim() || null;
      setSaving(true);
      try {
        await setVersionLabelAction(current.versionId, { decision, note: trimmed });
        setTraces((prev) =>
          prev.map((t, i) => (i === index ? { ...t, decision, note: trimmed } : t)),
        );
        if (advance && index < total - 1) go(1);
      } catch {
        toast.error("Save failed");
      } finally {
        setSaving(false);
      }
    },
    [current, decision, note, index, total, go],
  );

  // Global hotkeys. While typing in the note input, only Cmd/Ctrl+Enter saves (plain
  // Enter there is handled by the input itself); p/f/arrows are ignored while typing.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement;
      const typing = el.tagName === "INPUT" || el.tagName === "TEXTAREA";
      if (typing) {
        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
          e.preventDefault();
          void save(true);
        }
        return;
      }
      if (e.key === "p") setDecision((d) => (d === "pass" ? null : "pass"));
      else if (e.key === "f") setDecision((d) => (d === "fail" ? null : "fail"));
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "Enter") {
        e.preventDefault();
        void save(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, save]);

  if (!current) return null;

  return (
    <main className="flex h-[calc(100vh-4rem)] flex-col overflow-hidden">
      {/* Header */}
      <header className="shrink-0 border-b border-border">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-4 px-6 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="font-display text-lg font-semibold tracking-tight">
              {index + 1}
              <span className="text-muted-foreground">/{total}</span>
            </span>
            <span className="truncate text-sm text-muted-foreground">
              <span className="font-medium text-foreground">#{current.scriptNum}</span> ·{" "}
              {current.reelType} · &ldquo;{current.scriptTitle}&rdquo; · shot {current.shotIndex}
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <ListChecks className="size-3.5 text-primary" strokeWidth={1.5} />
              {labelled}/{total} labelled
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => go(-1)}
                disabled={index === 0}
                className={cn(
                  "inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                  index === 0 && "pointer-events-none opacity-40",
                )}
                aria-label="Previous"
              >
                <ChevronLeft className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => go(1)}
                disabled={index === total - 1}
                className={cn(
                  "inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                  index === total - 1 && "pointer-events-none opacity-40",
                )}
                aria-label="Next"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Body — scrolls */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <TracePanels trace={current} />
      </div>

      {/* Sticky label bar */}
      <LabelBar
        decision={decision}
        note={note}
        saving={saving}
        onDecision={setDecision}
        onNote={setNote}
        onSaveNext={() => void save(true)}
      />
    </main>
  );
}
