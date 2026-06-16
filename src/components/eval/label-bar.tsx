"use client";

import { useState } from "react";
import { Check, X, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type Decision = "pass" | "fail" | null;

type LabelBarProps = {
  decision: Decision;
  note: string;
  saving: boolean;
  noteRef: React.RefObject<HTMLTextAreaElement | null>;
  onDecision: (d: Decision) => void;
  onNote: (n: string) => void;
  onSaveNext: () => void;
};

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="ml-1 rounded border border-border bg-muted px-1 font-mono text-[0.6rem] leading-4 text-muted-foreground">
      {children}
    </kbd>
  );
}

// Sticky open-coding controls: binary pass/fail + a note, save & next. Keys: p / f
// mark + jump focus into the note (which expands in place); ⇧↵ there saves & next.
export function LabelBar({ decision, note, saving, noteRef, onDecision, onNote, onSaveNext }: LabelBarProps) {
  const [focused, setFocused] = useState(false);
  const expanded = focused || note.length > 0;
  return (
    <div className="shrink-0 border-t border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-4xl items-start gap-3 px-6 py-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onDecision(decision === "pass" ? null : "pass")}
            className={cn(
              "inline-flex items-center rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
              decision === "pass"
                ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400"
                : "border-border text-muted-foreground hover:bg-muted",
            )}
          >
            <Check className="size-4" /> Pass <Kbd>p</Kbd>
          </button>
          <button
            type="button"
            onClick={() => onDecision(decision === "fail" ? null : "fail")}
            className={cn(
              "inline-flex items-center rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
              decision === "fail"
                ? "border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400"
                : "border-border text-muted-foreground hover:bg-muted",
            )}
          >
            <X className="size-4" /> Fail <Kbd>f</Kbd>
          </button>
        </div>

        <textarea
          ref={noteRef}
          value={note}
          onChange={(e) => onNote(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            // ⇧↵ saves & moves to the next trace; plain ↵ inserts a newline.
            if (e.key === "Enter" && e.shiftKey) {
              e.preventDefault();
              onSaveNext();
            }
          }}
          rows={1}
          placeholder="note — what's wrong / right? (optional)  ·  ⇧↵ to save & next"
          className={cn(
            "flex-1 resize-none rounded-lg border border-border bg-background px-3 py-1.5 text-sm leading-6 transition-[height] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] focus:outline-none focus:ring-1 focus:ring-ring",
            expanded ? "h-24" : "h-9",
          )}
        />

        <Button size="lg" onClick={onSaveNext} disabled={saving}>
          Save & next
          <ArrowRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
