"use client";

import { useState } from "react";
import { XIcon, SparklesIcon, CheckIcon, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { EditableField } from "@/components/nodes/editable-field";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { KBField } from "@/lib/kb/schema";

const CONFIDENCE_LABEL = { high: "High", medium: "Med", low: "Low" };
const CONFIDENCE_CLASSES = {
  high: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  medium: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  low: "bg-muted text-muted-foreground",
};

// Gutter tick colour by reviewed state. `needs_review` has no tick (it renders
// the purple kicker rule instead); `rejected` is handled separately (muted dash).
const TICK_CLASSES = {
  needs_review: "",
  approved: "text-emerald-500 dark:text-emerald-400",
  edited: "text-blue-500 dark:text-blue-400",
  rejected: "",
};

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

type Props = {
  fieldKey: string;
  label: string;
  field: KBField<unknown>;
  isReanalyzing?: boolean;
  onEdit: (newValue: string | string[]) => void;
  onApprove: () => void;
  onReject: () => void;
  onReanalyze: (comment: string) => void;
};

export function KBFieldRow({
  label,
  field,
  isReanalyzing = false,
  onEdit,
  onApprove,
  onReject,
  onReanalyze,
}: Props) {
  const [aiOpen, setAiOpen] = useState(false);
  const [aiComment, setAiComment] = useState("");

  const isArray = Array.isArray(field.value) || field.value === null;
  const displayValue = formatValue(field.value);
  const isEmpty = !field.value || (Array.isArray(field.value) && field.value.length === 0);
  const isRejected = field.status === "rejected";
  const isReviewed = field.status === "approved" || field.status === "edited";

  // Commit an inline edit. Arrays are stored back as a comma-split list; a manual
  // edit always lands as status "edited" (EditableField fires onCommit only when
  // the value actually changed, so a no-op click won't flip the status).
  function commitEdit(next: string) {
    const parsed = isArray
      ? next.split(",").map((s) => s.trim()).filter(Boolean)
      : next.trim();
    onEdit(parsed);
  }

  function handleSubmitAI() {
    if (!aiComment.trim()) return;
    onReanalyze(aiComment.trim());
    setAiComment("");
    setAiOpen(false);
  }

  // ⌘/Ctrl+↵ submits. Escape / outside-click close is handled by the Popover.
  function handleAIKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSubmitAI();
    }
  }

  // Gutter: an editorial section label. The reviewed cue replaces the purple
  // kicker rule with a tick once a field is approved/edited; rejected fields get
  // a muted dash. Mirrors the Section gutter in script-document.tsx.
  return (
    <section className="grid gap-x-10 gap-y-2.5 sm:grid-cols-[160px_1fr]">
      <div className="self-start sm:sticky sm:top-2">
        <div className="mb-2 flex h-3.5 items-center" aria-hidden>
          {isReviewed ? (
            <CheckCircle2 className={cn("size-3.5", TICK_CLASSES[field.status])} />
          ) : isRejected ? (
            <span className="h-0.5 w-6 rounded-full bg-muted-foreground/40" />
          ) : (
            <span className="h-0.5 w-6 rounded-full bg-primary/70" />
          )}
        </div>
        <span
          className={cn(
            "text-eyebrow",
            isRejected && "text-muted-foreground line-through",
          )}
        >
          {label}
        </span>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span
            className={cn(
              "rounded-full px-1.5 py-0.5 text-[0.6rem] font-medium",
              CONFIDENCE_CLASSES[field.confidence],
            )}
          >
            {CONFIDENCE_LABEL[field.confidence]}
          </span>
          {field.evidence_type === "inferred" && (
            <span className="text-[0.6rem] text-muted-foreground">inferred</span>
          )}
        </div>
      </div>

      <div className={cn("min-w-0 leading-relaxed", isReanalyzing && "opacity-70")}>
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            {isReanalyzing ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent shrink-0" />
                Re-analyzing…
              </div>
            ) : isRejected ? (
              <p className="text-sm text-muted-foreground line-through">
                {isEmpty ? "No data extracted" : displayValue}
              </p>
            ) : (
              <EditableField
                value={displayValue}
                onCommit={commitEdit}
                multiline
                placeholder={isArray ? "Add values, comma-separated…" : "Add value…"}
                className="text-sm"
              />
            )}
          </div>

          {/* Action buttons — pinned top-right of the content column */}
          {!isReanalyzing && (
            <div className="flex shrink-0 items-center gap-1">
              {isRejected ? (
                <button
                  type="button"
                  onClick={() => onEdit((field.value as string | string[]) ?? "")}
                  className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                >
                  Restore
                </button>
              ) : (
                <>
                  {isEmpty && field.status === "needs_review" && (
                    <button
                      type="button"
                      onClick={onApprove}
                      title="Approve — confirm this field is empty"
                      className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-emerald-100 hover:text-emerald-700 dark:hover:bg-emerald-900/30 transition-colors"
                    >
                      <CheckIcon className="size-3.5" />
                    </button>
                  )}
                  <Popover
                    open={aiOpen}
                    onOpenChange={(o) => {
                      setAiOpen(o);
                      if (!o) setAiComment("");
                    }}
                  >
                    <PopoverTrigger
                      render={
                        <button
                          type="button"
                          title="Refine with AI"
                          className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary data-[popup-open]:bg-primary/10 data-[popup-open]:text-primary"
                        >
                          <SparklesIcon className="size-3.5" />
                        </button>
                      }
                    />
                    <PopoverContent align="end" sideOffset={6} className="w-80 gap-0">
                      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-foreground">
                        <SparklesIcon className="size-3.5 text-primary" />
                        Refine with AI
                      </div>
                      <p className="mb-2 text-xs text-muted-foreground">
                        Describe the change — the AI re-analyzes the sources and proposes a new value.
                      </p>
                      <textarea
                        autoFocus
                        className="w-full resize-none rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                        rows={3}
                        value={aiComment}
                        onChange={(e) => setAiComment(e.target.value)}
                        onKeyDown={handleAIKeyDown}
                        placeholder='e.g. "make this slower and more meditative"'
                      />
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-[0.6rem] text-muted-foreground">⌘↵ to submit</span>
                        <button
                          type="button"
                          onClick={handleSubmitAI}
                          disabled={!aiComment.trim()}
                          className="flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-40"
                        >
                          <SparklesIcon className="size-3" />
                          Re-analyze
                        </button>
                      </div>
                    </PopoverContent>
                  </Popover>
                  {!isEmpty && (
                    <button
                      type="button"
                      onClick={onReject}
                      title="Reject"
                      className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    >
                      <XIcon className="size-3.5" />
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
