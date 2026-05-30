"use client";

import { useState, type ChangeEvent } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ImageIcon } from "lucide-react";
import { useAppState } from "@/lib/app-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export default function ClientsPage() {
  const { clients, addClient } = useAppState();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [contextNotes, setContextNotes] = useState("");
  const [logo, setLogo] = useState("");

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
    const client = addClient(name.trim(), contextNotes.trim(), logo || undefined);
    toast.success(`Created “${client.name}”`);
    reset();
    setOpen(false);
  }

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-14">
      <header className="animate-rise mb-10 flex items-end justify-between">
        <div>
          <p className="text-eyebrow">Increment 1B · in-memory</p>
          <h1 className="mt-2 font-display text-5xl font-semibold tracking-[-0.02em]">
            Clients
          </h1>
        </div>

        <Dialog
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            if (!o) reset();
          }}
        >
          <DialogTrigger render={<Button>New client</Button>} />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New client</DialogTitle>
              <DialogDescription>
                A client is the top-level workspace. Context notes are ambient — every
                node on the client&apos;s canvases can use them later.
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
                />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleCreate}>Create client</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </header>

      {clients.length === 0 ? (
        <Card className="animate-rise flex flex-col items-center justify-center gap-2 border-dashed p-14 text-center">
          <p className="font-display text-lg font-medium">No clients yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Create one to get started. Heads up — this resets on refresh until we add
            persistence in 1D.
          </p>
        </Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {clients.map((client, i) => (
            <li
              key={client.id}
              className="animate-rise"
              style={{ animationDelay: `${80 + i * 45}ms` }}
            >
              <Link href={`/clients/${client.id}`} className="group block">
                <Card className="shadow-card gap-0 overflow-hidden p-0 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:-translate-y-0.5 group-hover:scale-[1.006]">
                  <div className="flex h-28 items-center justify-center border-b bg-muted/40 p-5">
                    {client.logo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={client.logo}
                        alt={`${client.name} logo`}
                        className="max-h-full max-w-[70%] object-contain"
                      />
                    ) : (
                      <span className="font-display text-3xl font-semibold text-muted-foreground/40">
                        {initials(client.name)}
                      </span>
                    )}
                  </div>
                  <CardHeader className="py-4">
                    <CardTitle className="font-display text-xl">
                      {client.name}
                    </CardTitle>
                    <CardDescription>
                      {client.canvases.length} canvas
                      {client.canvases.length === 1 ? "" : "es"}
                    </CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
