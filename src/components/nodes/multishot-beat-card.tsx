"use client";

import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { MentionInstructionEditor } from "./mention-instruction-editor";
import { imageRefDialect } from "@/lib/nodes/prompt-token-dialect";
import type { UpstreamNode } from "./connected-inputs-card";

/**
 * One beat of the breakup view.
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
  rerunning = false,
  showRerun = false,
  onFocusTimings,
  disabled = false,
}: {
  index: number;
  from: number;
  to: number;
  text: string;
  upstream: UpstreamNode[];
  refIds: string[];
  onChange: (next: string) => void;
  onRerun: () => void;
  rerunning?: boolean;
  /**
   * Whether to render the rewrite button. The caller withholds it while the multishot flow
   * settles; `onRerun` stays wired so turning it back on is one flag, not a rebuild.
   */
  showRerun?: boolean;
  onFocusTimings: () => void;
  // D33 — the canvas read-only lock. Disables editing AND both action buttons.
  disabled?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 shadow-card">
      <div className="mb-2 flex items-center gap-2">
        <Button
          variant="ghost"
          onClick={onFocusTimings}
          title="Timings live on the Multishot node"
          className="h-auto rounded px-1 py-0.5 text-eyebrow text-muted-foreground hover:bg-muted hover:text-foreground dark:hover:bg-muted"
        >
          [{from}-{to}s]
        </Button>
        <span className="text-eyebrow text-muted-foreground">Shot {index + 1}</span>
        {showRerun && (
          <Button
            variant="ghost"
            onClick={onRerun}
            disabled={rerunning || disabled}
            aria-label={`Rewrite shot ${index + 1}`}
            className="ml-auto h-auto rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground dark:hover:bg-muted"
          >
            <RefreshCw className={cn("size-3.5", rerunning && "animate-spin")} strokeWidth={1.5} />
          </Button>
        )}
      </div>
      <MentionInstructionEditor
        value={text}
        onChange={onChange}
        upstream={upstream}
        disabled={disabled}
        dialect={imageRefDialect(refIds)}
        placeholder="Not written yet…"
      />
    </div>
  );
}
