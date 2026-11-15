"use client";

import type { ReactNode } from "react";
import { PanelLeftClose, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useCopilotCollapsed } from "@/hooks/use-copilot-collapsed";
import { journeyFoldKey } from "@/lib/journey/frame";
import { cn } from "@/lib/utils";
import { JourneyRail } from "./journey-rail";

/** The copilot panel on a stage's page: the card, its header, the fold and the rail. What goes
 *  inside is the stage's own (a guide, or a chat). The shell matches the script copilot
 *  (copilot-chat.tsx) so the two read as one panel; from lg up it folds to a rail, remembered per
 *  client in this browser. Shown from lg only: on a narrow screen the page keeps its full width. */
export function JourneyPanelShell({ slug, waiting, busy = false, children }: {
  slug: string;
  /** Shown on the folded rail; null shows the word "Copilot". */
  waiting: string | null;
  /** Folding is refused while true (a turn is in flight). */
  busy?: boolean;
  /** The body under the header. */
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useCopilotCollapsed(journeyFoldKey(slug));

  return (
    <section
      aria-label="Copilot"
      className={cn(
        "hidden shrink-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-card lg:sticky lg:top-20 lg:flex lg:h-[calc(100vh-12rem)]",
        "transition-[width] duration-[320ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
        collapsed ? "lg:w-12" : "lg:w-[29rem]",
      )}
    >
      {collapsed && <JourneyRail waiting={waiting} onExpand={() => setCollapsed(false)} />}
      {/* Held at the open width, so unfolding reveals it rather than reflowing mid-animation. It
          stays mounted while folded: a half-typed message and an upload in progress survive. */}
      <div className={cn("flex min-h-0 flex-1 flex-col lg:w-[calc(29rem-2px)] lg:shrink-0", collapsed && "lg:hidden")}>
        <header className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Sparkles className="size-4 text-primary" strokeWidth={1.5} aria-hidden />
          <h2 className="font-display text-base font-medium">Copilot</h2>
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
                    className="ml-auto text-muted-foreground"
                  />
                }
              >
                <PanelLeftClose strokeWidth={1.5} />
              </TooltipTrigger>
              <TooltipContent side="bottom">Hide copilot</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </header>
        {children}
      </div>
    </section>
  );
}
