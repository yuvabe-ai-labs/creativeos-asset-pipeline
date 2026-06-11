"use client";

import { Info, Sparkles } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type LlmToggleRowProps = {
  useLlm: boolean;
  onToggle: (v: boolean) => void;
};

export function LlmToggleRow({ useLlm, onToggle }: LlmToggleRowProps) {
  return (
    <div className="shrink-0 mb-4">
      <div className="h-px bg-border" />
      <div className="flex items-center gap-2.5 py-3">
        <Sparkles className="size-4 text-primary shrink-0" />

        <button
          type="button"
          aria-pressed={useLlm}
          onClick={() => onToggle(!useLlm)}
          className={cn(
            "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            useLlm ? "bg-primary" : "bg-input",
          )}
        >
          <span
            className={cn(
              "pointer-events-none inline-block size-4 rounded-full bg-background shadow-lg ring-0 transition-transform",
              useLlm ? "translate-x-4" : "translate-x-0",
            )}
          />
        </button>

        <span className="text-sm font-medium">Use LLM</span>

        <Tooltip>
          <TooltipTrigger
            className="inline-flex items-center text-muted-foreground/60 hover:text-muted-foreground transition-colors"
            aria-label="About LLM extraction"
            delay={0}
          >
            <Info className="size-3.5" />
          </TooltipTrigger>
          <TooltipContent>
            Uses AI to extract specific information from your file. Write a prompt
            describing what you want — the result is saved to this node and can be
            referenced by other nodes.
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
