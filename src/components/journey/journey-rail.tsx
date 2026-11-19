import { PanelLeftOpen, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

/** The copilot folded away: a slim rail that brings it back, and still says what is waiting. */
export function JourneyRail({ line, onExpand }: { line: string | null; onExpand: () => void }) {
  return (
    <div className="hidden min-h-0 flex-1 flex-col items-center gap-4 py-3 lg:flex">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Show copilot" onClick={onExpand} />}>
            <PanelLeftOpen strokeWidth={1.5} />
          </TooltipTrigger>
          <TooltipContent side="right">Show copilot</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <Sparkles className="size-4 shrink-0 text-primary" strokeWidth={1.5} aria-hidden />
      {line ? (
        <>
          <span className="size-2 shrink-0 rounded-full bg-warning" aria-hidden />
          <span className="min-h-0 overflow-hidden text-xs font-medium text-foreground [writing-mode:vertical-rl]">{line}</span>
        </>
      ) : (
        <span className="text-eyebrow [writing-mode:vertical-rl]">Copilot</span>
      )}
    </div>
  );
}
