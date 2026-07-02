"use client";

import { cn } from "@/lib/utils";
import { EditableField } from "./editable-field";
import { normalizeTitle } from "@/lib/nodes/title";

type NodeTitleProps = {
  value: string;
  onCommit: (next: string) => void;
  placeholder: string;
  className?: string;
};

// Inline-editable title for a canvas node's face. Wraps EditableField in single-line
// mode (so it truncates on the compact card) and normalizes the committed value.
// The wrapper stops double-clicks from bubbling to the node's own
// double-click-to-open-focus handler; EditableField's `nodrag` class already keeps
// React Flow from starting a pan/drag when you click into the field.
export function NodeTitle({ value, onCommit, placeholder, className }: NodeTitleProps) {
  return (
    <div
      className={cn("min-w-0", className)}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <EditableField
        singleLine
        value={value}
        onCommit={(t) => onCommit(normalizeTitle(t))}
        placeholder={placeholder}
        className="font-display text-sm font-medium"
      />
    </div>
  );
}
