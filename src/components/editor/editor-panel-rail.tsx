"use client";

import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/** A collapsed side panel (D403): a thin rail that opens it again. */
export function EditorPanelRail({ label, side, shortcut, onExpand }: { label: string; side: "left" | "right"; shortcut: string; onExpand(): void }) {
  const Icon = side === "left" ? ChevronRight : ChevronLeft;
  return (
    <aside aria-label={`${label}, hidden`} className="flex min-h-0 flex-col items-center gap-3 rounded-[14px] border border-border bg-card py-2">
      <Button variant="ghost" size="icon" aria-label={`Show ${label.toLowerCase()}`} title={`Show ${label.toLowerCase()} (${shortcut})`} onClick={onExpand} className="size-7">
        <Icon className="size-4" strokeWidth={1.5} />
      </Button>
      <Button variant="ghost" onClick={onExpand} className="text-eyebrow-sm h-auto px-1 py-2 [writing-mode:vertical-rl]">
        {label}
      </Button>
    </aside>
  );
}

/** A side panel's header: its name, an optional count, and the chevron. The whole row hides the
 *  panel, not just the chevron. */
export function EditorPanelHeader({ label, aside, side, shortcut, onCollapse }: { label: string; aside?: ReactNode; side: "left" | "right"; shortcut: string; onCollapse(): void }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <Button
      variant="ghost"
      aria-label={`Hide ${label.toLowerCase()}`}
      title={`Hide ${label.toLowerCase()} (${shortcut})`}
      onClick={onCollapse}
      className="group/header -mx-2 h-8 w-[calc(100%+1rem)] flex-none justify-between gap-2 px-2 font-normal"
    >
      <span className="text-eyebrow-sm">{label}</span>
      <span className="flex items-center gap-1.5">
        {aside !== undefined && <span className="text-xs tabular-nums text-muted-foreground">{aside}</span>}
        <Icon className="size-4 text-muted-foreground transition-colors duration-200 group-hover/header:text-foreground" strokeWidth={1.5} />
      </span>
    </Button>
  );
}
