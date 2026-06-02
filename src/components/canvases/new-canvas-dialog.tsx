"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createCanvasAction } from "@/lib/actions/canvases";
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

export function NewCanvasDialog({
  clientId,
  clientSlug,
}: {
  clientId: string;
  clientSlug: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();

  function handleCreate() {
    if (!name.trim()) {
      toast.error("Canvas needs a name");
      return;
    }
    startTransition(async () => {
      try {
        const canvas = await createCanvasAction({
          clientId,
          clientSlug,
          name: name.trim(),
        });
        toast.success(`Created “${canvas.name}”`);
        setName("");
        setOpen(false);
        router.refresh();
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
        if (!o) setName("");
      }}
    >
      <DialogTrigger render={<Button>New canvas</Button>} />
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
