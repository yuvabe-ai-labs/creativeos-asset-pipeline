import { PanelLeftOpen, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

/** The copilot folded away so the script can take the page: a slim rail that brings it back. */
export function CopilotRail({ onExpand }: { onExpand: () => void }) {
  return (
    <div className="hidden flex-1 flex-col items-center gap-4 py-3 lg:flex">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Show copilot" onClick={onExpand} />}>
            <PanelLeftOpen strokeWidth={1.5} />
          </TooltipTrigger>
          <TooltipContent side="right">Show copilot</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <Sparkles className="size-4 text-primary" strokeWidth={1.5} aria-hidden />
      <span className="text-eyebrow [writing-mode:vertical-rl]">Copilot</span>
    </div>
  );
}
