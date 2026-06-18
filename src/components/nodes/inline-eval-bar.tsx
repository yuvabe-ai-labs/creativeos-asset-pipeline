"use client";

import { ThumbsUp, ThumbsDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Decision = "pass" | "fail" | null;

type InlineEvalBarProps = {
  decision: Decision;
  note: string;
  saving: boolean;
  visible: boolean;
  label?: string;
  onDecision: (d: Decision) => void;
  onNote: (n: string) => void;
  onNoteBlur: () => void;
};

export function InlineEvalBar({
  decision,
  note,
  saving,
  visible,
  label = "Generated Prompt",
  onDecision,
  onNote,
  onNoteBlur,
}: InlineEvalBarProps) {
  function toggle(value: "pass" | "fail") {
    onDecision(decision === value ? null : value);
  }

  const showNote = visible && decision !== null;

  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between">
        <span className="text-eyebrow">{label}</span>

        {visible && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={saving}
              onClick={() => toggle("pass")}
              title="Mark as pass"
              className={cn(
                "inline-flex items-center justify-center rounded-md border p-1.5 transition-colors disabled:opacity-50",
                decision === "pass"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400"
                  : "border-border bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {saving && decision === "pass" ? (
                <Loader2 className="size-3.5 animate-spin" strokeWidth={1.5} />
              ) : (
                <ThumbsUp className="size-3.5" strokeWidth={1.5} />
              )}
            </button>

            <button
              type="button"
              disabled={saving}
              onClick={() => toggle("fail")}
              title="Mark as fail"
              className={cn(
                "inline-flex items-center justify-center rounded-md border p-1.5 transition-colors disabled:opacity-50",
                decision === "fail"
                  ? "border-red-200 bg-red-50 text-red-600 dark:border-red-800 dark:bg-red-950/40 dark:text-red-400"
                  : "border-border bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {saving && decision === "fail" ? (
                <Loader2 className="size-3.5 animate-spin" strokeWidth={1.5} />
              ) : (
                <ThumbsDown className="size-3.5" strokeWidth={1.5} />
              )}
            </button>
          </div>
        )}
      </div>

      {/* CSS-only height transition — avoids any motion library width side-effects */}
      <div
        className={cn(
          "grid transition-all duration-200",
          showNote ? "mt-2 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
        style={{ transitionTimingFunction: "cubic-bezier(0.22,1,0.36,1)" }}
      >
        <div className="min-h-0 overflow-hidden">
          <textarea
            value={note}
            onChange={(e) => onNote(e.target.value)}
            onBlur={onNoteBlur}
            placeholder="Add a note…"
            rows={1}
            className="w-full resize-none rounded-md border border-border bg-background px-2.5 py-1.5 text-xs leading-relaxed text-foreground placeholder:text-muted-foreground/50 focus:border-primary/60 focus:outline-none"
          />
        </div>
      </div>
    </div>
  );
}
