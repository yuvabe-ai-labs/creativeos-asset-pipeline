"use client";

import type { LucideIcon } from "lucide-react";
import { AudioLines, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type Tool = {
  open: boolean;
  disabled: boolean;
  /** Its job is running: a small dot, so it shows even with the panel closed. */
  running: boolean;
  onOpenChange: (open: boolean) => void;
};

// D487 — Edit video and Change voice are tools on the take, not main actions: two quiet icon
// buttons right after the VIDEO heading, named on hover, tinted while their panel is open. They
// sit beside the heading, not at the column's far edge: the take is sized to its own shape, so on
// a wide column the far edge is past the video and the tools would float away from it.
export function VideoGenEditTools({ edit, voice }: { edit: Tool; voice: Tool }) {
  return (
    <TooltipProvider delay={200}>
      <div className="flex items-center gap-0.5 border-l border-border pl-2">
        <ToolButton icon={Sparkles} label="Edit video" tool={edit} />
        <ToolButton icon={AudioLines} label="Change voice" tool={voice} />
      </div>
    </TooltipProvider>
  );
}

function ToolButton({ icon: Icon, label, tool }: { icon: LucideIcon; label: string; tool: Tool }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={label}
            aria-pressed={tool.open}
            disabled={tool.disabled}
            onClick={() => tool.onOpenChange(!tool.open)}
            className={cn(
              "relative text-muted-foreground",
              tool.open && "border border-primary/35 bg-primary/8 text-primary hover:bg-primary/8 hover:text-primary",
            )}
          />
        }
      >
        <Icon className="size-4" strokeWidth={1.5} />
        {tool.running && <span className="absolute right-1 top-1 size-1.5 animate-pulse rounded-full bg-primary" />}
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}
