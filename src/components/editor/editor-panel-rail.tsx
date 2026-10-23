"use client";

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
      <Button variant="ghost" onClick={onExpand} className="h-auto px-1 py-2 text-[11px] uppercase tracking-[0.08em] text-muted-foreground [writing-mode:vertical-rl]">
        {label}
      </Button>
    </aside>
  );
}

/** The chevron that hides a side panel. */
export function EditorPanelCollapse({ label, side, shortcut, onCollapse }: { label: string; side: "left" | "right"; shortcut: string; onCollapse(): void }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <Button variant="ghost" size="icon" aria-label={`Hide ${label.toLowerCase()}`} title={`Hide ${label.toLowerCase()} (${shortcut})`} onClick={onCollapse} className="size-7 text-muted-foreground">
      <Icon className="size-4" strokeWidth={1.5} />
    </Button>
  );
}
