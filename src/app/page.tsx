"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useAppState } from "@/lib/app-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export default function ClientsPage() {
  const { clients, addClient } = useAppState();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [contextNotes, setContextNotes] = useState("");

  function handleCreate() {
    if (!name.trim()) {
      toast.error("Client needs a name");
      return;
    }
    const client = addClient(name.trim(), contextNotes.trim());
    toast.success(`Created “${client.name}”`);
    setName("");
    setContextNotes("");
    setOpen(false);
  }

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-12">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Increment 1B · in-memory
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">Clients</h1>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
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
        <Card className="flex flex-col items-center justify-center gap-2 border-dashed p-12 text-center">
          <p className="font-medium">No clients yet</p>
          <p className="text-sm text-muted-foreground">
            Create one to get started. (Heads up: this resets on refresh until we add
            persistence in 1D.)
          </p>
        </Card>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {clients.map((client) => (
            <li key={client.id}>
              <Link href={`/clients/${client.id}`}>
                <Card className="gap-1 p-5 transition-colors hover:border-foreground/30">
                  <span className="font-medium">{client.name}</span>
                  <span className="text-sm text-muted-foreground">
                    {client.canvases.length} canvas
                    {client.canvases.length === 1 ? "" : "es"}
                  </span>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
