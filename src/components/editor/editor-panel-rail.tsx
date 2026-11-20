"use client";

import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** A collapsed side panel (D403): a thin rail, all of it one button that opens the panel again. */
export function EditorPanelRail({ label, side, shortcut, onExpand }: { label: string; side: "left" | "right"; shortcut: string; onExpand(): void }) {
  const Icon = side === "left" ? ChevronRight : ChevronLeft;
  return (
    <aside aria-label={`${label}, hidden`} className="flex min-h-0 rounded-[14px] border border-border bg-card">
      <Button
        variant="ghost"
        aria-label={`Show ${label.toLowerCase()}`}
        title={`Show ${label.toLowerCase()} (${shortcut})`}
        onClick={onExpand}
        className="group/rail h-full w-full flex-col items-center justify-start gap-3 rounded-[13px] px-0 py-3 font-normal"
      >
        <Icon className="size-4 text-muted-foreground transition-colors duration-200 group-hover/rail:text-foreground" strokeWidth={1.5} />
        <span className="text-eyebrow-sm [writing-mode:vertical-rl]">{label}</span>
      </Button>
    </aside>
  );
}

/** A side panel's header: its name and an optional count on the left; its actions, then the hide
 *  chevron (pointing at the edge the panel hides into), on the right. Same order on either side. */
export function EditorPanelHeader({ label, aside, actions, side, shortcut, onCollapse, className }: {
  label: string;
  aside?: ReactNode;
  /** Buttons shown before the chevron. */
  actions?: ReactNode;
  side: "left" | "right";
  shortcut: string;
  onCollapse(): void;
  className?: string;
}) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <div className={cn("flex h-8 items-center gap-1", className)}>
      <span className="text-eyebrow-sm min-w-0 flex-1 truncate">{label}</span>
      {aside !== undefined && <span className="text-xs tabular-nums text-muted-foreground">{aside}</span>}
      {actions}
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Hide ${label.toLowerCase()}`}
        title={`Hide ${label.toLowerCase()} (${shortcut})`}
        onClick={onCollapse}
        className="-mr-2 text-muted-foreground hover:text-foreground"
      >
        <Icon className="size-4" strokeWidth={1.5} />
      </Button>
    </div>
  );
}
