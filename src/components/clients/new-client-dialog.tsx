"use client";

import { useState, useTransition, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ImageIcon } from "lucide-react";
import { createClientAction } from "@/lib/actions/clients";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function NewClientDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [contextNotes, setContextNotes] = useState("");
  const [logo, setLogo] = useState("");
  const [pending, startTransition] = useTransition();

  function handleLogoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () =>
      setLogo(typeof reader.result === "string" ? reader.result : "");
    reader.readAsDataURL(file);
  }

  function reset() {
    setName("");
    setContextNotes("");
    setLogo("");
  }

  function handleCreate() {
    if (!name.trim()) {
      toast.error("Client needs a name");
      return;
    }
    startTransition(async () => {
      try {
        const client = await createClientAction({
          name: name.trim(),
          logo: logo || null,
          contextNotes: contextNotes.trim(),
        });
        toast.success(`Created “${client.name}”`);
        reset();
        setOpen(false);
        router.refresh(); // re-fetch the (server-rendered) clients list
      } catch {
        toast.error("Failed to create client");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger render={<Button>New client</Button>} />
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New client</DialogTitle>
          <DialogDescription>
            A client is the top-level workspace. Context notes are ambient — every node
            on the client&apos;s canvases can use them later.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Acme Co."
              autoFocus
            />
          </div>

          <div className="grid gap-2">
            <Label>Logo</Label>
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-border p-3 transition-colors hover:bg-muted/40">
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logo}
                  alt="Logo preview"
                  className="size-11 rounded-md object-contain"
                />
              ) : (
                <span className="flex size-11 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  <ImageIcon className="size-5" />
                </span>
              )}
              <span className="text-sm text-muted-foreground">
                {logo ? "Change logo" : "Upload a logo (PNG, SVG, JPG)"}
              </span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleLogoChange}
              />
            </label>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="notes">Context notes</Label>
            <Textarea
              id="notes"
              value={contextNotes}
              onChange={(e) => setContextNotes(e.target.value)}
              placeholder="Brand voice, product notes, tone…"
              rows={4}
              className="max-h-48 overflow-y-auto"
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleCreate} disabled={pending}>
            {pending ? "Creating…" : "Create client"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
