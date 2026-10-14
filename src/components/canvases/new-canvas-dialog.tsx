"use client";

import { useState, useTransition, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createCanvasAction, createCanvasFromScriptAction } from "@/lib/actions/canvases";
import { canvasHref } from "@/lib/canvases/paths";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

// `trigger` lets the empty state reuse this dialog instead of standing up a second
// creation path — one dialog, two entry points.
export function NewCanvasDialog({
  clientId,
  clientSlug,
  trigger,
  fromScript,
}: {
  clientId: string;
  clientSlug: string;
  trigger?: ReactElement;
  /** D371 — creating this canvas for an approved script: the name starts as the script's title,
   *  and the canvas is the script's (made now, or the one it already has). */
  fromScript?: { id: string; title: string };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(fromScript?.title ?? "");
  const [pending, startTransition] = useTransition();

  function handleCreate() {
    if (!name.trim()) {
      toast.error("Canvas needs a name");
      return;
    }
    startTransition(async () => {
      try {
        // Navigate straight into the new canvas. We DON'T close the dialog or
        // reset state first — the navigation unmounts this dialog as the canvas
        // page renders, so there's no flash of the canvases list in between.
        // (startTransition keeps `pending` true through the navigation, so the
        // button stays "Creating…" until the canvas is on screen.)
        if (fromScript) {
          // A canvas made now asks to add the script on arrival; an existing one already has it.
          const { canvas, created } = await createCanvasFromScriptAction({ clientId, clientSlug, scriptId: fromScript.id, name: name.trim() });
          router.push(canvasHref(clientSlug, canvas.slug, created ? fromScript.id : undefined));
          toast.success(created ? `Created “${canvas.name}”` : `This script already has a canvas: “${canvas.name}”`);
          return;
        }
        const canvas = await createCanvasAction({
          clientId,
          clientSlug,
          name: name.trim(),
        });
        router.push(canvasHref(clientSlug, canvas.slug));
        toast.success(`Created “${canvas.name}”`);
      } catch {
        toast.error("Failed to create canvas");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setName(fromScript?.title ?? "");
      }}
    >
      <DialogTrigger render={trigger ?? <Button>New canvas</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New canvas</DialogTitle>
        </DialogHeader>
        <div className="grid gap-2 py-2">
          <Label htmlFor="canvas-name">Name</Label>
          <Input
            id="canvas-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Spring campaign reel"
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button onClick={handleCreate} disabled={pending}>
            {pending ? "Creating…" : "Create canvas"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
