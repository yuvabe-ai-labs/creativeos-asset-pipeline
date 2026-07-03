import Link from "next/link";
import { getClientBySlug } from "@/lib/db/clients";
import { getCanvasBySlug } from "@/lib/db/canvases";
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
import { IdentityGate } from "@/components/identity/identity-gate";
import { IdentityChip } from "@/components/identity/identity-chip";
import { listNodes } from "@/lib/db/nodes";
import { listEdges } from "@/lib/db/edges";
import { nodeRowToFlow } from "@/lib/canvas-nodes";
import { getLatestKBJob } from "@/lib/db/kb-jobs";
import { getActiveKBVersion } from "@/lib/db/kb";

export const dynamic = "force-dynamic";

export default async function CanvasPage({
  params,
}: {
  params: Promise<{ id: string; cid: string }>;
}) {
  const { id, cid } = await params; // client slug, canvas slug
  const client = await getClientBySlug(id);
  const canvas = client ? await getCanvasBySlug(client.id, cid) : null;

  if (!client || !canvas) {
    return (
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-12">
        <Card className="flex flex-col items-center gap-2 border-dashed p-12 text-center">
          <p className="font-display text-lg font-medium">Canvas not found</p>
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

  const [initialNodes, initialEdges, latestKBJob, activeKBVersion] = await Promise.all([
    listNodes(canvas.id).then((rows) => rows.map(nodeRowToFlow)),
    listEdges(canvas.id),
    getLatestKBJob(client.id),
    getActiveKBVersion(client.id),
  ]);

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-border/70 bg-background/60 px-6 py-3 backdrop-blur">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink render={<Link href="/">Clients</Link>} />
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink
                render={
                  <Link href={`/clients/${client.slug}`}>{client.name}</Link>
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
        {/* D29: soft identity — who's the maker/checker. Set once at app start. */}
        <IdentityChip />    
      </header>

      <div className="relative flex-1">
        {/* load this canvas's nodes from the DB, seed the store, autosave changes */}
        {/* D29: block until an identity is set, so generations/approvals are attributed. */}
        <IdentityGate>
          <CanvasStoreProvider key={canvas.id} initialNodes={initialNodes} initialEdges={initialEdges}>
            <Canvas canvasId={canvas.id} />
          </CanvasStoreProvider>
        </IdentityGate>
      </div>
    </main>
  );
}
