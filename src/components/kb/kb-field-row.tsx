"use client";

import { useState, useRef } from "react";
import { PencilIcon, XIcon, SparklesIcon, CheckIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { KBField } from "@/lib/kb/schema";

const CONFIDENCE_LABEL = { high: "High", medium: "Med", low: "Low" };
const CONFIDENCE_CLASSES = {
  high: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  medium: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  low: "bg-muted text-muted-foreground",
};

const STATUS_CLASSES = {
  needs_review: "border-border",
  approved: "border-emerald-300 bg-emerald-50/30 dark:border-emerald-800 dark:bg-emerald-950/20",
  edited: "border-blue-300 bg-blue-50/30 dark:border-blue-800 dark:bg-blue-950/20",
  rejected: "border-border bg-muted/30 opacity-60",
};

const STATUS_TAG_CLASSES = {
  needs_review: "hidden",
  approved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  edited: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  rejected: "bg-muted text-muted-foreground line-through",
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
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(formatValue(field.value));
  const [aiComment, setAiComment] = useState("");
  const aiTextareaRef = useRef<HTMLTextAreaElement>(null);

  const isArray = Array.isArray(field.value) || field.value === null;
  const displayValue = formatValue(field.value);
  const isEmpty = !field.value || (Array.isArray(field.value) && field.value.length === 0);

  function handleSaveEdit() {
    const parsed = isArray
      ? editValue.split(",").map((s) => s.trim()).filter(Boolean)
      : editValue.trim();
    onEdit(parsed);
    setEditing(false);
    setAiComment("");
  }

  function handleStartEdit() {
    setEditValue(formatValue(field.value));
    setAiComment("");
    setEditing(true);
  }

  function handleCancelEdit() {
    setEditing(false);
    setAiComment("");
  }

  function handleSubmitAI() {
    if (!aiComment.trim()) return;
    onReanalyze(aiComment.trim());
    setAiComment("");
    setEditing(false);
  }

  function handleEditKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSaveEdit();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      handleCancelEdit();
    }
  }

  function handleAIKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSubmitAI();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setAiComment("");
      aiTextareaRef.current?.blur();
    }
  }

  const isRejected = field.status === "rejected";
  const disabled = isReanalyzing || editing;

  return (
    <div
      className={cn(
        "rounded-lg border p-3 transition-colors",
        STATUS_CLASSES[field.status],
        isReanalyzing && "opacity-70",
      )}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {label}
          </span>
          {field.status !== "needs_review" && (
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-[0.6rem] font-semibold capitalize",
                STATUS_TAG_CLASSES[field.status],
              )}
            >
              {field.status}
            </span>
          )}
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

        {/* Action buttons */}
        {!isRejected && !isReanalyzing && !editing && (
          <div className="flex items-center gap-1 shrink-0">
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
            <button
              type="button"
              onClick={handleStartEdit}
              title="Edit"
              className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-blue-100 hover:text-blue-700 dark:hover:bg-blue-900/30 transition-colors"
            >
              <PencilIcon className="size-3.5" />
            </button>
            {!isEmpty && (
              <button
                type="button"
                onClick={onReject}
                title="Reject"
                disabled={disabled}
                className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:pointer-events-none disabled:opacity-40"
              >
                <XIcon className="size-3.5" />
              </button>
            )}
          </div>
        )}
        {isRejected && !isReanalyzing && (
          <button
            type="button"
            onClick={() => onEdit(field.value as string | string[] ?? "")}
            className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
          >
            Restore
          </button>
        )}
      </div>

      {/* Value / edit / reanalyzing state */}
      {isReanalyzing ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent shrink-0" />
          Re-analyzing…
        </div>
      ) : editing ? (
        <div className="space-y-2">
          {/* Manual edit */}
          <textarea
            className="w-full rounded-md border border-border bg-background px-2.5 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
            rows={isArray ? 2 : 3}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleEditKeyDown}
            placeholder={isArray ? "Comma-separated values" : "Enter value"}
            autoFocus
          />
          {isArray && (
            <p className="text-[0.65rem] text-muted-foreground">Separate multiple values with commas</p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSaveEdit}
              className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              Save
            </button>
            <button
              type="button"
              onClick={handleCancelEdit}
              className="rounded-md px-3 py-1 text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
            <span className="ml-auto text-[0.6rem] text-muted-foreground self-center">⌘↵ to save · Esc to cancel</span>
          </div>

          {/* AI guidance — inline below the manual edit */}
          <div className="mt-1 rounded-md border border-dashed border-border bg-muted/20 p-2 space-y-1.5">
            <div className="flex items-center gap-1 text-[0.65rem] text-muted-foreground">
              <SparklesIcon className="size-3 shrink-0" />
              <span>AI guidance</span>
            </div>
            <textarea
              ref={aiTextareaRef}
              className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-ring"
              rows={2}
              value={aiComment}
              onChange={(e) => setAiComment(e.target.value)}
              onKeyDown={handleAIKeyDown}
              placeholder='e.g. "make this slower and more meditative"'
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSubmitAI}
                disabled={!aiComment.trim()}
                className="flex items-center gap-1 rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted/80 disabled:opacity-40 disabled:pointer-events-none"
              >
                <SparklesIcon className="size-3" />
                Re-analyze
              </button>
              <span className="text-[0.6rem] text-muted-foreground">⌘↵ to submit</span>
            </div>
          </div>
        </div>
      ) : (
        <div>
          {isEmpty ? (
            <p className="text-sm text-muted-foreground italic">No data extracted</p>
          ) : (
            <p className={cn("text-sm", isRejected && "line-through text-muted-foreground")}>
              {displayValue}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
