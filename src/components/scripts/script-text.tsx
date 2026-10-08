"use client";

import { useState, type KeyboardEvent } from "react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useScriptEdit } from "./script-edit-context";

type Props = {
  /** The field's path (src/lib/scripts/copilot/fields.ts). */
  path: string;
  value: string;
  /** One line: Enter saves. Otherwise Ctrl/Cmd+Enter or leaving the field saves. */
  multiline?: boolean;
  placeholder?: string;
  className?: string;
  /** Opens straight into typing (the "Add a watch-out" slot). */
  initiallyEditing?: boolean;
  onDone?: () => void;
};

/** One script field. Plain text unless a ScriptEditProvider is above it (spec 2 §9: typing, and the
 *  selection that starts an inline AI edit). The display is a focusable span, not a Button, because
 *  text inside a button cannot be selected, and selecting text is how an inline edit starts. */
export function ScriptText({ path, value, multiline = true, placeholder = "Add…", className, initiallyEditing = false, onDone }: Props) {
  const edit = useScriptEdit();
  const [editing, setEditing] = useState(initiallyEditing);
  const [draft, setDraft] = useState(value);

  if (!edit) return <>{value}</>;

  const start = () => { setDraft(value); setEditing(true); };
  const finish = (save: boolean) => {
    setEditing(false);
    if (save && draft !== value) edit.commit(path, draft);
    onDone?.();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); finish(false); }
    if (e.key === "Enter" && (!multiline || e.metaKey || e.ctrlKey)) { e.preventDefault(); finish(true); }
  };

  if (editing) {
    return (
      <Textarea
        autoFocus
        value={draft}
        rows={multiline ? 3 : 1}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => finish(true)}
        onKeyDown={onKeyDown}
        className={cn("min-h-0 text-sm", className)}
      />
    );
  }

  const empty = value.trim() === "";
  return (
    <span
      role="button"
      tabIndex={0}
      // Only real text is selectable for an inline edit; a placeholder never is.
      data-script-path={empty ? undefined : path}
      onMouseUp={() => {
        // A plain click starts typing; a drag-selection is left for the inline AI prompt.
        if (window.getSelection()?.isCollapsed ?? true) start();
      }}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); start(); } }}
      className={cn(
        "cursor-pointer whitespace-pre-wrap rounded-sm underline decoration-transparent decoration-dotted decoration-2 underline-offset-4 transition-colors duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-primary/5 hover:decoration-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        empty && "text-muted-foreground",
        edit.busyPath === path && "animate-pulse",
        className,
      )}
    >
      {empty ? placeholder : value}
    </span>
  );
}
