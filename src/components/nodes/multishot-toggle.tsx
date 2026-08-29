"use client";

import { useState } from "react";
import { Scissors } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";

/**
 * D193 — the only multishot control there is.
 *
 * On a grouped node, turning it OFF is a structural change: the node is replaced by one node per
 * beat. That earns a confirm, because it is not undoable by flipping the switch back — there is
 * deliberately no merge (regrouping means re-running fan-out).
 *
 * On a single-beat node it is a plain flag: on means the model may cut inside this one shot, off
 * means one continuous take.
 */
export function MultishotToggle({
  nodeId,
  multishot,
  beatCount,
}: {
  nodeId: string;
  multishot: boolean;
  beatCount: number;
}) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const splitMultishotNode = useCanvasStore((s) => s.splitMultishotNode);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const splitsOnDisable = multishot && beatCount > 1;

  function handleChange(next: boolean) {
    if (!next && splitsOnDisable) {
      setConfirmOpen(true);
      return;
    }
    updateNodeData(nodeId, { multishot: next });
  }

  return (
    <>
      <div className="nodrag flex items-center gap-1.5">
        <Switch
          checked={multishot}
          onCheckedChange={handleChange}
          aria-label="Multishot"
          size="sm"
        />
        <span
          className={cn(
            "text-[0.6rem] font-medium uppercase tracking-wide transition-colors duration-200",
            multishot ? "text-primary" : "text-muted-foreground",
          )}
        >
          Multishot
        </span>
        {multishot && beatCount > 1 && (
          <span className="text-[0.6rem] text-muted-foreground">{beatCount} beats</span>
        )}
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Split this shot into {beatCount}?</AlertDialogTitle>
            <AlertDialogDescription>
              Turning multishot off replaces this node with one node per beat, each keeping the
              full script context. Anything connected downstream of it is disconnected, because a
              prompt written for a cut sequence does not describe a single beat. There is no
              merge — to regroup, fan out from the script again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel render={<Button variant="ghost" />}>Keep as one</AlertDialogCancel>
            <AlertDialogAction
              render={<Button variant="default" />}
              onClick={() => splitMultishotNode(nodeId)}
            >
              <Scissors className="size-3.5" strokeWidth={1.5} />
              Split into {beatCount}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
