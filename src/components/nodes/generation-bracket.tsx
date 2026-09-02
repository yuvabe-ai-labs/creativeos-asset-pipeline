"use client";

import { Layers, Film } from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import type { Generation } from "@/lib/nodes/group-shots";

/**
 * D206 — one generation's rows, bracketed, with the single control that sets its mode.
 *
 * The bracket exists because a generation spans several rows: a switch sitting on ONE row would
 * reach rows the operator did not touch. Drawing the scope makes the switch's reach a fact on
 * screen rather than something learned by surprise.
 */
export function GenerationBracket({
  generation,
  scriptNodeId,
  readOnly = false,
  children,
}: {
  generation: Generation;
  scriptNodeId: string;
  readOnly?: boolean;
  children: React.ReactNode;
}) {
  const setGenerationMode = useCanvasStore((s) => s.setGenerationMode);
  const Icon = generation.multishot ? Layers : Film;

  return (
    <div className="relative pl-4">
      {/* The scope, drawn. A left rule spanning exactly the rows this switch governs. */}
      <span
        aria-hidden
        className={cn(
          "absolute left-0 top-1 bottom-1 w-px transition-colors duration-200",
          generation.multishot ? "bg-primary/30" : "bg-border",
        )}
      />
      <div className="mb-2 flex items-center gap-2">
        <Icon
          className={cn("size-3.5", generation.multishot ? "text-primary" : "text-muted-foreground")}
          strokeWidth={1.5}
        />
        <span className="text-eyebrow">
          Gen {generation.index + 1} · {generation.seconds}s
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <span
            className={cn(
              "text-[0.65rem] font-medium transition-colors duration-200",
              generation.multishot ? "text-primary" : "text-muted-foreground",
            )}
          >
            Multishot
          </span>
          <Switch
            size="sm"
            checked={generation.multishot}
            disabled={readOnly}
            aria-label={`Multishot for generation ${generation.index + 1}`}
            onCheckedChange={(next) => setGenerationMode(scriptNodeId, generation.key, next)}
          />
        </div>
      </div>
      {children}
    </div>
  );
}
