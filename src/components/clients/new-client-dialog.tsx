"use client";

import { useState, useTransition, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ImageIcon } from "lucide-react";
import { createClientAction } from "@/lib/actions/clients";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type LogoState = { file: File; preview: string } | null;

export function NewClientDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [logo, setLogo] = useState<LogoState>(null);
  const [pending, startTransition] = useTransition();

  function handleLogoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setLogo({ file, preview: reader.result });
      }
    };
    reader.readAsDataURL(file);
  }

  function reset() {
    setName("");
    setLogo(null);
  }

  function handleCreate() {
    if (!name.trim()) {
      toast.error("Client needs a name");
      return;
    }
    startTransition(async () => {
      try {
        const client = await createClientAction({ name: name.trim() });
        // Upload logo in background — do not block closing the dialog
        if (logo) {
          const formData = new FormData();
          formData.append("file", logo.file);
          fetch(`/api/clients/${client.id}/logo`, {
            method: "POST",
            body: formData,
          }).catch(() => {
            // Non-critical: logo upload failure shows a separate toast if desired
          });
        }
        toast.success(`Created "${client.name}"`);
        reset();
        setOpen(false);
        router.refresh();
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
            Add a client to start building their brand knowledge base.
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
                  src={logo.preview}
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
