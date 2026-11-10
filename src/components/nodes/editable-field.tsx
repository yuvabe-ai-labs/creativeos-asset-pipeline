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
  /**
   * Classes for the EDITOR only (the Input / Textarea), on top of `className`. For a field that
   * must edit in place — same padding and no box around it, so the text does not jump and the
   * field's own container keeps scrolling — pass the primitive's border/ring/padding overrides
   * here rather than making every display state carry them too.
   */
  editClassName?: string;
  // Custom render for the committed (non-editing) value. Clicking still enters
  // edit mode — the raw text is always what gets edited. Falls back to plain text.
  renderDisplay?: (value: string) => ReactNode;
  /**
   * Report every keystroke through `onCommit`, not only on Enter / blur. For a field inside a
   * view that BUFFERS its edits behind its own Save (the Multishot focus view), so that view's
   * Save enables as soon as something is typed. Esc still reverts, by committing the value the
   * edit started from. Never set it where `onCommit` writes through to the canvas: that would
   * be a store write (and an autosave) per keystroke.
   */
  live?: boolean;
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
  editClassName,
  renderDisplay,
  live = false,
}: EditableFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  // The value the current edit started from — what Esc goes back to in `live` mode, where the
  // parent's `value` has already followed every keystroke.
  const [start, setStart] = useState(value);

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
          setStart(value);
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

  function change(next: string) {
    setDraft(next);
    if (live) onCommit(next);
  }
  function commit() {
    setEditing(false);
    if (!live && draft !== value) onCommit(draft);
  }
  function cancel() {
    setEditing(false);
    setDraft(start);
    if (live && draft !== start) onCommit(start);
  }

  if (multiline) {
    return (
      <Textarea
        autoFocus
        rows={3}
        value={draft}
        onChange={(e) => change(e.target.value)}
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
        className={cn("nodrag", className, editClassName)}
      />
    );
  }

  return (
    <Input
      autoFocus
      value={draft}
      onChange={(e) => change(e.target.value)}
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
      className={cn("nodrag", className, editClassName)}
    />
  );
}
