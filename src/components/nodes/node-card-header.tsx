"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { NodeTitle } from "./node-title";
import { NodeHandle } from "./node-handle";

type Props = {
  icon: LucideIcon;
  nodeId: string;
  nodeType: string;
  // The node's title (editable) or, for read-only nodes, a static identity label.
  title: string;
  placeholder?: string;
  // Omit to render `title` as a NON-editable label (e.g. "Note", "Shot 2", a brand name).
  onCommitTitle?: (next: string) => void;
  // Right-aligned indicator slot — a status dot, a processing pill, an upload spinner, etc.
  status?: ReactNode;
};

// Shared card header for canvas nodes. The type icon sits on the title's line, the
// editable title fills the row (falling back to `placeholder` when the node is untitled),
// and the node's stable ref handle sits just beneath it, left-aligned to the title TEXT.
export function NodeCardHeader({
  icon: Icon,
  nodeId,
  nodeType,
  title,
  placeholder,
  onCommitTitle,
  status,
}: Props) {
  return (
    // Two stacked rows, not a two-column split. The status used to sit in a right-hand column
    // centred against BOTH lines, while the ref handle below renders at 20-28px with
    // whitespace-nowrap — so the handle overflowed its column and ran underneath the status
    // pill. Putting the status on the title's own row means the handle gets the full width and
    // the two can never collide, at any zoom tier.
    <div className="border-b border-border px-3 py-2">
      <div className="flex items-center gap-1.5">
        <Icon className="size-3.5 shrink-0 stroke-[1.5] text-primary" />
        {onCommitTitle ? (
          <NodeTitle value={title} placeholder={placeholder ?? ""} onCommit={onCommitTitle} />
        ) : (
          // Static label — same font/inset as the editable title so the ref handle below
          // lines up identically (the px-1.5 matches NodeTitle's field padding).
          <span className="min-w-0 flex-1 truncate px-1.5 py-1 font-display text-sm font-medium">
            {title}
          </span>
        )}
        {status != null && <div className="shrink-0">{status}</div>}
      </div>
      {/* Ref handle on its own full-width row, indented to sit under the title TEXT:
          icon 14px + gap 6px + the title field's own px-1.5 (6px) = 26px. */}
      <NodeHandle nodeId={nodeId} nodeType={nodeType} className="block pl-[26px]" />
    </div>
  );
}
