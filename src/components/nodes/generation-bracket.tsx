"use client";

import { useState } from "react";
import { Layers, Film, Unlink } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
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
import { generationKey } from "@/lib/nodes/group-shots";

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
