"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useCanvasEditable } from "@/components/canvas/canvas-editable-context";

type EditableFieldProps = {
  value: string;
  onCommit: (next: string) => void;
  multiline?: boolean;
  // Truncate the committed value to a single line (with ellipsis) instead of
  // wrapping — for titles on compact cards. Ignored when multiline.
  singleLine?: boolean;
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
  singleLine = false,
  placeholder = "Add…",
  readOnly = false,
  className,
  renderDisplay,
}: EditableFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const editable = useCanvasEditable();
  const isReadOnly = readOnly || !editable; // D33: strict read-only under the lock

  const isEmpty = value.trim() === "";

  if (isReadOnly) {
    return (
      <span
        className={cn(
          // Either/or, never both: `truncate` sets white-space:nowrap, so emitting
          // whitespace-pre-wrap alongside it leaves the winner up to stylesheet order
          // — and pre-wrap won, so single-line titles wrapped instead of ellipsing.
          singleLine ? "block truncate" : "whitespace-pre-wrap",
          isEmpty && "text-muted-foreground",
          className,
        )}
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
          "nodrag w-full cursor-pointer rounded-md px-1.5 py-1 text-left underline decoration-transparent decoration-dotted decoration-2 underline-offset-4 transition-colors hover:bg-primary/5 hover:decoration-primary/50",
          singleLine ? "block truncate" : "whitespace-pre-wrap",
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
          // stopPropagation, not just preventDefault: when this field sits inside a Sheet or
          // Dialog, that dialog listens for Escape on the DOCUMENT and never checks
          // defaultPrevented — so cancelling an edit would also close the editor around it.
          if (e.key === "Escape") {
            e.stopPropagation();
            e.preventDefault();
            cancel();
          }
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.stopPropagation();
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
        // See the multiline branch above — an enclosing Sheet/Dialog closes on Escape from a
        // document-level listener that ignores defaultPrevented.
        if (e.key === "Escape") {
          e.stopPropagation();
          e.preventDefault();
          cancel();
        }
        if (e.key === "Enter") {
          e.stopPropagation();
          e.preventDefault();
          commit();
        }
      }}
      className={cn("nodrag", className)}
    />
  );
}
