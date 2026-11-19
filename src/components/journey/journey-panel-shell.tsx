"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft, PanelLeftClose, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useCopilotCollapsed } from "@/hooks/use-copilot-collapsed";
import { cn } from "@/lib/utils";
import { JourneyRail } from "./journey-rail";

/** Where the panel sticks: under the client frame's header, or near the top of a page that has no
 *  frame (a script's page). */
const PLACEMENT = {
  frame: "lg:top-20 lg:h-[calc(100vh-6.5rem)]",
  page: "lg:top-6 lg:h-[calc(100vh-12rem)]",
} as const;

/** The copilot panel, the same on every page that has one (the brand KB, the stage guides, a
 *  script): the card, its header, the fold and the rail. What goes inside is the page's own. From lg
 *  up it folds to a rail, remembered under `foldKey` in this browser. */
export function JourneyPanelShell({
  foldKey, foldedByDefault = false, waitingLine, busy = false, back, placement = "frame", narrow = "hidden", children, actions,
}: {
  foldKey: string;
  /** How a panel never folded in this browser starts. */
  foldedByDefault?: boolean;
  /** The whole sentence on the folded rail; null shows the word "Copilot". */
  waitingLine: string | null;
  /** Folding is refused while true (a turn is in flight). */
  busy?: boolean;
  /** A link back, first in the header (a script's panel back to its client). */
  back?: { label: string; href: string };
  placement?: keyof typeof PLACEMENT;
  /** Below lg: not drawn, so the page keeps its width, or stacked above the page. */
  narrow?: "hidden" | "stacked";
  /** The body under the header. */
  children: ReactNode;
  /** Controls in the header, before the fold (the developer switch, D509). */
  actions?: ReactNode;
}) {
  const [collapsed, setCollapsed] = useCopilotCollapsed(foldKey, foldedByDefault);

  return (
    <section
      aria-label="Copilot"
      className={cn(
        "shrink-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-card lg:sticky lg:flex",
        narrow === "hidden" ? "hidden" : "flex min-h-[32rem]",
        PLACEMENT[placement],
        "transition-[width] duration-[320ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
        collapsed ? "lg:w-12" : "lg:w-[29rem]",
      )}
    >
      {collapsed && <JourneyRail line={waitingLine} onExpand={() => setCollapsed(false)} />}
      {/* Held at the open width, so unfolding reveals it rather than reflowing mid-animation. It
          stays mounted while folded: a half-typed message and an upload in progress survive. */}
      <div className={cn("flex min-h-0 flex-1 flex-col lg:w-[calc(29rem-2px)] lg:shrink-0", collapsed && "lg:hidden")}>
        <header className="flex items-center gap-2 border-b border-border px-4 py-3">
          {back && (
            <Button variant="ghost" size="xs" className="-ml-2 text-muted-foreground" nativeButton={false} render={<Link href={back.href} />}>
              <ChevronLeft strokeWidth={1.5} />
              {back.label}
            </Button>
          )}
          <Sparkles className="size-4 text-primary" strokeWidth={1.5} aria-hidden />
          <h2 className="font-display text-base font-medium">Copilot</h2>
          <div className="ml-auto flex items-center gap-2">
            {actions}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Hide copilot"
                      disabled={busy}
                      onClick={() => setCollapsed(true)}
                      // A stacked panel has no rail to fold to below lg.
                      className={cn("text-muted-foreground", narrow === "stacked" && "hidden lg:inline-flex")}
                    />
                  }
                >
                  <PanelLeftClose strokeWidth={1.5} />
                </TooltipTrigger>
                <TooltipContent side="bottom">Hide copilot</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </header>
        {children}
      </div>
    </section>
  );
}
