"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useAppState } from "@/lib/app-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { CanvasStoreProvider } from "@/components/canvas/canvas-store-provider";
import { Canvas } from "@/components/canvas/canvas";

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
            nativeButton={false}
            render={<Link href="/">← All clients</Link>}
          />
        </Card>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center border-b border-border/70 bg-background/60 px-6 py-3 backdrop-blur">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink render={<Link href="/">Clients</Link>} />
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink
                render={
                  <Link href={`/clients/${client.id}`}>{client.name}</Link>
                }
              />
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage className="font-display font-medium">
                {canvas.name}
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </header>

      <div className="relative flex-1">
        {/* key by canvas id → a fresh store when you switch canvases */}
        <CanvasStoreProvider key={canvas.id}>
          <Canvas />
        </CanvasStoreProvider>
      </div>
    </main>
  );
}
