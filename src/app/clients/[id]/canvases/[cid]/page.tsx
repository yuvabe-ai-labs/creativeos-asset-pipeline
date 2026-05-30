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
      <header className="flex items-center gap-3 border-b px-6 py-3">
        <Button
          variant="ghost"
          size="sm"
          render={<Link href={`/clients/${client.id}`}>←</Link>}
        />
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground">{client.name}</span>
          <span className="font-medium leading-tight">{canvas.name}</span>
        </div>
      </header>

      <div className="flex flex-1 items-center justify-center bg-muted/30 p-6">
        <div className="text-center text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Canvas editor</p>
          <p>The React Flow canvas + Zustand store arrive in increment 1C.</p>
        </div>
      </div>
    </main>
  );
}
