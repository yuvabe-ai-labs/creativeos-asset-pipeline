"use client";

import { useState } from "react";
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
}: EditableFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const isEmpty = value.trim() === "";

  if (readOnly) {
    return (
      <span
        className={cn("whitespace-pre-wrap", isEmpty && "text-muted-foreground", className)}
      >
        {isEmpty ? placeholder : value}
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
        className={cn(
          "nodrag w-full whitespace-pre-wrap rounded-md px-1 py-0.5 text-left hover:bg-muted/60",
          isEmpty && "text-muted-foreground",
          className,
        )}
      >
        {isEmpty ? placeholder : value}
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
