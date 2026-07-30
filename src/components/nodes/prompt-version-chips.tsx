"use client";

import { cn } from "@/lib/utils";
import { buildVersionChips } from "@/lib/nodes/prompt-focus";
import type { VersionSummary } from "./prompt-version-history";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

function formatWhen(dateStr: string): string {
  return new Date(dateStr).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function PromptVersionChips({
  versions,
  activeVersionId,
  restoring,
  onSwitch,
}: {
  versions: VersionSummary[];
  activeVersionId: string | null;
  restoring: boolean;
  onSwitch: (versionId: string) => void;
}) {
  if (versions.length === 0) return null;
  const chips = buildVersionChips(versions, activeVersionId, restoring);

  return (
    <TooltipProvider delay={200}>
      <div className="flex flex-wrap items-center gap-1">
        {chips.map((chip, i) => {
          const v = versions[i];
          return (
            <Tooltip key={chip.id}>
              <TooltipTrigger
                render={
                  <Button
                    variant="outline"
                    size="xs"
                    disabled={chip.disabled}
                    onClick={() => !chip.disabled && onSwitch(chip.id)}
                    className={cn(
                      "tabular-nums",
                      chip.isActive
                        ? "border-primary bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary"
                        : chip.isError
                          ? "text-red-500"
                          : "text-muted-foreground",
                    )}
                  />
                }
              >
                {chip.label}
              </TooltipTrigger>
              <TooltipContent>
                <div className="space-y-0.5">
                  <p className="font-medium">
                    {chip.label}
                    {chip.isActive ? " · active" : ""}
                    {chip.isError ? " · error" : ""}
                  </p>
                  {v.modelUsed && <p className="opacity-80">{v.modelUsed}</p>}
                  <p className="opacity-80">{formatWhen(v.createdAt)}</p>
                  {v.decision && <p className="opacity-80">eval: {v.decision}</p>}
                  {!chip.isActive && !chip.isError && (
                    <p className="opacity-60">Click to switch</p>
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
