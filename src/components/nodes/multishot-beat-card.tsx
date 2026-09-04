"use client";

import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { MentionInstructionEditor } from "./mention-instruction-editor";
import { imageRefDialect } from "@/lib/nodes/prompt-token-dialect";
import { RefineWithAI } from "./refine-with-ai";
import type { UpstreamNode } from "./connected-inputs-card";

/**
 * One full-width row of the breakup view's output (Option A, 2026-09-03) — a fixed-width
 * timecode gutter beside the beat's prose, so the text gets the whole body's width instead of
 * being boxed into a third of it.
 *
 * The timecode is READ-ONLY: durations live on the Multishot node and have exactly one home.
 * Clicking it focuses that node, which is where the budget is.
 *
 * The text is the SAME chip editor the instruction uses, in the `<IMAGE_REF_N>` dialect — so a
 * reference is a picture here as well as upstream, and editing the prose around it never exposes
 * the raw token.
 */
export function MultishotBeatCard({
  index,
  from,
  to,
  text,
  upstream,
  refIds,
  onChange,
  onRerun,
  onRefine,
  rerunning = false,
  showRerun = false,
  onFocusTimings,
  disabled = false,
  isLast = false,
}: {
  index: number;
  from: number;
  to: number;
  text: string;
  upstream: UpstreamNode[];
  refIds: string[];
  onChange: (next: string) => void;
  onRerun: () => void;
  /** Rewrite this beat with an operator note. Same call as onRerun, with a steer attached. */
  onRefine: (note: string) => void;
  rerunning?: boolean;
  /**
   * Whether to render the rewrite button. The caller withholds it while the multishot flow
   * settles; `onRerun` stays wired so turning it back on is one flag, not a rebuild.
   */
  showRerun?: boolean;
  onFocusTimings: () => void;
  // D33 — the canvas read-only lock. Disables editing AND both action buttons.
  disabled?: boolean;
  // Suppresses the row's bottom border — the container draws borders BETWEEN rows, not under
  // the last one.
  isLast?: boolean;
}) {
  return (
    <div className={cn("flex gap-4 p-4", !isLast && "border-b border-border")}>
      <div className="flex w-[92px] shrink-0 flex-col gap-1">
        <Button
          variant="ghost"
          onClick={onFocusTimings}
          title="Timings live on the Multishot node"
          className="h-auto w-fit rounded px-1 py-0.5 text-sm font-medium tabular-nums text-primary hover:bg-primary/5 dark:hover:bg-primary/10"
        >
          {from}–{to}s
        </Button>
        <span className="text-eyebrow text-muted-foreground">Shot {index + 1}</span>
      </div>

      <div className="min-w-0 flex-1">
        {showRerun && (
          <div className="mb-1.5 flex items-center justify-end gap-0.5">
            <RefineWithAI
              scope="cut"
              busy={rerunning}
              disabled={disabled}
              onSubmit={onRefine}
              label={`Refine shot ${index + 1} with AI`}
            />
            <Button
              variant="ghost"
              onClick={onRerun}
              disabled={rerunning || disabled}
              aria-label={`Rewrite shot ${index + 1}`}
              className="h-auto rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground dark:hover:bg-muted"
            >
              <RefreshCw className={cn("size-3.5", rerunning && "animate-spin")} strokeWidth={1.5} />
            </Button>
          </div>
        )}
        <div className={cn(rerunning && "pointer-events-none opacity-50")}>
          <MentionInstructionEditor
            value={text}
            onChange={onChange}
            upstream={upstream}
            disabled={disabled}
            dialect={imageRefDialect(refIds)}
            placeholder="Not written yet…"
          />
        </div>
      </div>
    </div>
  );
}
