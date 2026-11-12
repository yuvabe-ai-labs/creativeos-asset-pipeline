"use client";

import Link from "next/link";
import { Check, PanelLeftClose, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useCopilotCollapsed } from "@/hooks/use-copilot-collapsed";
import type { Guide } from "@/lib/journey/guide";
import { cn } from "@/lib/utils";
import { JourneyRail } from "./journey-rail";

/** The copilot's guide on a stage's page (copilot journey spec §4.3): what is done, what is
 *  waiting for the person, and the next approval. The shell matches the script copilot
 *  (copilot-chat.tsx) so the two read as one panel; from lg up it folds to a rail, remembered per
 *  client in this browser. Shown from lg only: on a narrow screen the page keeps its full width. */
export function JourneyPanel({ clientId, guide }: { clientId: string; guide: Guide }) {
  const [collapsed, setCollapsed] = useCopilotCollapsed(`journey.${clientId}`);

  return (
    <section
      aria-label="Copilot"
      className={cn(
        "hidden shrink-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-card lg:sticky lg:top-20 lg:flex lg:h-[calc(100vh-10rem)]",
        "transition-[width] duration-[320ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
        collapsed ? "lg:w-12" : "lg:w-80",
      )}
    >
      {collapsed ? (
        <JourneyRail waiting={guide.waiting} onExpand={() => setCollapsed(false)} />
      ) : (
        // Held at the open width, so unfolding reveals it rather than reflowing mid-animation.
        <div className="flex min-h-0 flex-1 flex-col lg:w-[calc(20rem-2px)] lg:shrink-0">
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

          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4" aria-live="polite">
            {guide.done.length > 0 && (
              <ul className="flex flex-col gap-2">
                {guide.done.map((line) => (
                  <li key={line} className="flex items-center gap-2 text-sm font-medium text-success-text">
                    <Check className="size-4 shrink-0" strokeWidth={1.5} aria-hidden />
                    {line}
                  </li>
                ))}
              </ul>
            )}

            {guide.waiting && (
              <p className="flex items-start gap-2 text-sm font-medium text-foreground">
                <span className="mt-1.5 size-2 shrink-0 rounded-full bg-warning" aria-hidden />
                <span>Waiting for you: {guide.waiting}</span>
              </p>
            )}

            {guide.gate && (
              <div className="flex flex-col gap-1.5 rounded-xl border border-border p-4">
                <p className="text-sm font-medium">{guide.gate.title}</p>
                <p className="text-sm text-muted-foreground">{guide.gate.body}</p>
              </div>
            )}

            {guide.next && (
              <Button
                variant="outline"
                className="self-start"
                nativeButton={false}
                render={<Link href={guide.next.href}>{guide.next.label}</Link>}
              />
            )}
          </div>
        </div>
      )}
    </section>
  );
}
