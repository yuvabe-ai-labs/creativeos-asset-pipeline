"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { useAppState } from "@/lib/app-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export default function ClientPage() {
  const { id } = useParams<{ id: string }>();
  const { getClient, addCanvas } = useAppState();
  const client = getClient(id);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  if (!client) {
    return (
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-12">
        <Card className="flex flex-col items-center gap-2 border-dashed p-12 text-center">
          <p className="font-medium">Client not found</p>
          <p className="text-sm text-muted-foreground">
            In-memory state resets on refresh (until 1D). Head back and create one.
          </p>
          <Button
            variant="outline"
            className="mt-2"
            render={<Link href="/">← All clients</Link>}
          />
        </Card>
      </main>
    );
  }

  function handleCreate() {
    if (!name.trim()) {
      toast.error("Canvas needs a name");
      return;
    }
    const canvas = addCanvas(client!.id, name.trim());
    if (canvas) toast.success(`Created “${canvas.name}”`);
    setName("");
    setOpen(false);
  }

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-12">
      <Link
        href="/"
        className="text-eyebrow transition-colors hover:text-foreground"
      >
        ← All clients
      </Link>

      <header className="animate-rise mb-10 mt-3 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-semibold tracking-[-0.02em]">
            {client.name}
          </h1>
          {client.contextNotes && (
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
              {client.contextNotes}
            </p>
          )}
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
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
              <Button onClick={handleCreate}>Create canvas</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </header>

      {client.canvases.length === 0 ? (
        <Card className="animate-rise flex flex-col items-center gap-2 border-dashed p-14 text-center">
          <p className="font-display text-lg font-medium">No canvases yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            A canvas is one creative project. Create one to open the (empty) editor.
          </p>
        </Card>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {client.canvases.map((canvas, i) => (
            <li
              key={canvas.id}
              className="animate-rise"
              style={{ animationDelay: `${80 + i * 45}ms` }}
            >
              <Link
                href={`/clients/${client.id}/canvases/${canvas.id}`}
                className="group block"
              >
                <Card className="shadow-card p-6 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:-translate-y-0.5 group-hover:scale-[1.006]">
                  <span className="font-display text-xl font-medium">
                    {canvas.name}
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
