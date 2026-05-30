"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useAppState } from "@/lib/app-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function CanvasPage() {
  const { id, cid } = useParams<{ id: string; cid: string }>();
  const { getClient } = useAppState();
  const client = getClient(id);
  const canvas = client?.canvases.find((c) => c.id === cid);

  if (!client || !canvas) {
    return (
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-12">
        <Card className="flex flex-col items-center gap-2 border-dashed p-12 text-center">
          <p className="font-medium">Canvas not found</p>
          <p className="text-sm text-muted-foreground">
            In-memory state resets on refresh (until 1D).
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

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center gap-3 border-b border-border/70 bg-background/60 px-5 py-2.5 backdrop-blur">
        <Button
          variant="ghost"
          size="sm"
          render={<Link href={`/clients/${client.id}`}>←</Link>}
        />
        <div className="flex flex-col">
          <span className="font-mono text-[0.7rem] uppercase tracking-[0.15em] text-muted-foreground">
            {client.name}
          </span>
          <span className="font-display font-medium leading-tight">
            {canvas.name}
          </span>
        </div>
      </header>

      <div className="canvas-surface flex flex-1 items-center justify-center p-6">
        <div className="animate-rise rounded-xl border border-border/70 bg-card/80 px-8 py-6 text-center shadow-sm backdrop-blur-sm">
          <p className="font-display text-lg font-medium text-foreground">
            Canvas editor
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            The React Flow canvas + Zustand store arrive in increment 1C.
          </p>
        </div>
      </div>
    </main>
  );
}
