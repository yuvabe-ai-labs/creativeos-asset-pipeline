"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type EditableFieldProps = {
  value: string;
  onCommit: (next: string) => void;
  multiline?: boolean;
  placeholder?: string;
  readOnly?: boolean;
  className?: string;
  // Custom render for the committed (non-editing) value. Clicking still enters
  // edit mode — the raw text is always what gets edited. Falls back to plain text.
  renderDisplay?: (value: string) => ReactNode;
};

// Click-to-edit text. Renders as read-only text until clicked, then becomes an
// Input (or Textarea). Enter (or Cmd/Ctrl+Enter for multiline) and blur commit;
// Esc cancels. Commits only when the value actually changed.
export function EditableField({
  value,
  onCommit,
  multiline = false,
  placeholder = "Add…",
  readOnly = false,
  className,
  renderDisplay,
}: EditableFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const isEmpty = value.trim() === "";

  if (readOnly) {
    return (
      <span
        className={cn("whitespace-pre-wrap", isEmpty && "text-muted-foreground", className)}
      >
        {isEmpty ? placeholder : renderDisplay ? renderDisplay(value) : value}
      </span>
    );
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
        title="Click to edit"
        className={cn(
          "nodrag w-full cursor-pointer whitespace-pre-wrap rounded-md px-1.5 py-1 text-left underline decoration-transparent decoration-dotted decoration-2 underline-offset-4 transition-colors hover:bg-primary/5 hover:decoration-primary/50",
          isEmpty && "text-muted-foreground",
          className,
        )}
      >
        {isEmpty ? placeholder : renderDisplay ? renderDisplay(value) : value}
      </button>
    );
  }

  function commit() {
    setEditing(false);
    if (draft !== value) onCommit(draft);
  }
  function cancel() {
    setEditing(false);
    setDraft(value);
  }

  if (multiline) {
    return (
      <Textarea
        autoFocus
        rows={3}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            commit();
          }
        }}
        className={cn("nodrag", className)}
      />
    );
  }

  return (
    <Input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          cancel();
        }
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        }
      }}
      className={cn("nodrag", className)}
    />
  );
}
