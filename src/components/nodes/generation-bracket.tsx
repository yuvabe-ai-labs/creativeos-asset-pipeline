"use client";

import { useState } from "react";
import { Layers, Film, Unlink, TriangleAlert, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import { useCanvasEditable } from "@/components/canvas/canvas-editable-context";
import type { Generation } from "@/lib/nodes/group-shots";
import { generationKey, PACK_CEILING_SECONDS } from "@/lib/nodes/group-shots";
import { SHOT_MAX_SECONDS } from "@/lib/nodes/derive-shot-duration";

/**
 * D227 — one generation's rows, bracketed, with the single control that sets its mode.
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
  const editable = useCanvasEditable();
  const isReadOnly = readOnly || !editable; // D33: strict read-only under the lock
  const Icon = generation.multishot ? Layers : Film;

  // Only a flip that DISCONNECTS something earns a dialog. Flipping a freshly fanned-out node —
  // the common case, and the undo the operator actually wants — stays silent.
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const [pending, setPending] = useState<boolean | null>(null);

  const nodeForThisGeneration = nodes.find(
    (n) =>
      (n.type === "shot" || n.type === "multishot") &&
      (n.data as { seededFrom?: { scriptNodeId?: string; shotIndexes?: number[] } }).seededFrom
        ?.scriptNodeId === scriptNodeId &&
      generationKey(
        (n.data as { seededFrom?: { shotIndexes?: number[] } }).seededFrom?.shotIndexes ?? [],
      ) === generation.key,
  );
  const downstreamCount = nodeForThisGeneration
    ? edges.filter((e) => e.source === nodeForThisGeneration.id).length
    : 0;

  // The recommendation says WHY, for this group. Past the default single-take models' reach the
  // reason is concrete: as one take it needs a long-take model picked by hand, while multishot
  // starts on one that fits (D261). Names no model — that is the Multishot node's sentence.
  const shotCount = generation.shotIndexes.length;
  const recommendReason =
    generation.seconds > SHOT_MAX_SECONDS
      ? `${shotCount} shots, ${generation.seconds}s. Multishot keeps each shot as its own cut and starts on a model that fits ${generation.seconds}s. As a single take, only some models reach that length.`
      : `${shotCount} shots. Multishot generates them as one sequence with a cut between each, instead of blending them into a single take.`;

  function handleChange(next: boolean) {
    if (downstreamCount > 0) {
      setPending(next);
      return;
    }
    setGenerationMode(scriptNodeId, generation.key, next);
  }

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
        {/* The one thing regrouping cannot fix: a single shot longer than any model's window.
            Names no model — which model to use is the Multishot node's sentence to write. */}
        {generation.overCeiling && (
          <Tooltip>
            <TooltipTrigger
              render={<Badge variant="destructive" className="gap-1 font-medium" />}
            >
              <TriangleAlert className="size-3" strokeWidth={1.5} />
              over limit
            </TooltipTrigger>
            <TooltipContent>
              {generation.seconds}s is longer than any model can generate (max{" "}
              {PACK_CEILING_SECONDS}s). Split this shot on the script.
            </TooltipContent>
          </Tooltip>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          {/* D259 — advisory only. Fan-out never flips the switch: turning multishot back off
              disconnects downstream nodes, so the expensive direction stays the operator's.
              A tinted pill, not bare text: at the label's own size and colour it read as one
              phrase with it ("Recommended Multishot"). The 5% tint keeps purple sparing while
              pointing the eye at the switch; it fades in when the operator switches back off. */}
          {generation.recommendMultishot && !generation.multishot && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <span className="mr-0.5 inline-flex cursor-default items-center gap-1 rounded-full border border-primary/20 bg-primary/5 py-0.5 pr-2 pl-1.5 text-[0.65rem] font-medium text-primary animate-in fade-in-0 zoom-in-95 duration-200 ease-(--ease-out)" />
                }
              >
                <Sparkles className="size-3" strokeWidth={1.5} />
                Recommended
              </TooltipTrigger>
              <TooltipContent>{recommendReason}</TooltipContent>
            </Tooltip>
          )}
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
            disabled={isReadOnly}
            aria-label={`Multishot for generation ${generation.index + 1}`}
            onCheckedChange={handleChange}
          />
        </div>
      </div>
      {children}

      <AlertDialog open={pending !== null} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Switch generation {generation.index + 1} to {pending ? "multishot" : "a single take"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The shot keeps its place on the canvas and its script connection. What it feeds —
              {downstreamCount === 1 ? " 1 node" : ` ${downstreamCount} nodes`} — is disconnected,
              because a prompt written for a cut sequence does not describe a single take. Your
              shot text and timings are kept either way.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel render={<Button variant="ghost" />}>Keep as is</AlertDialogCancel>
            <AlertDialogAction
              render={<Button variant="default" />}
              onClick={() => {
                if (pending !== null) setGenerationMode(scriptNodeId, generation.key, pending);
                setPending(null);
              }}
            >
              <Unlink className="size-3.5" strokeWidth={1.5} />
              Switch and disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
