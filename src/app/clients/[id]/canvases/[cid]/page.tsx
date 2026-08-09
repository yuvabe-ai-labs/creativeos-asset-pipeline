import Link from "next/link";
import { getClientBySlug } from "@/lib/db/clients";
import { getCanvasBySlug } from "@/lib/db/canvases";
import { resolveCallerContext } from "@/lib/dal";
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
import { GalleryDrawerProvider } from "@/components/canvas/gallery-drawer-context";
import { GalleryDrawerTrigger } from "@/components/canvas/gallery-drawer-trigger";
import { CanvasCostChip } from "@/components/canvas/canvas-cost-chip";
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
  const caller = await resolveCallerContext();

  // Org isolation: a canvas outside the caller's org renders as not-found, never
  // confirming a foreign org's canvas exists — see the note in ../../page.tsx.
  if (!client || !canvas || client.org_id !== caller.orgId) {
    return (
      <main className="mx-auto flex w-full max-w-4xl flex-1 items-center justify-center px-6 py-12">
        <Card className="flex min-w-[26rem] flex-col items-center gap-3 border-dashed p-16 text-center">
          <p className="font-display text-2xl font-medium">Canvas not found</p>
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

  let initialDriveRootFolder: { id: string; name: string } | null = null;
  if (client.drive_root_folder_id) {
    try {
      const { exchangeRefreshToken } = await import("@/lib/drive/client");
      const token = await exchangeRefreshToken();
      const metaRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${client.drive_root_folder_id}?fields=id,name&supportsAllDrives=true`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (metaRes.ok) {
        const meta = (await metaRes.json()) as { id: string; name: string };
        initialDriveRootFolder = { id: meta.id, name: meta.name };
      }
    } catch {
      // Non-fatal — drawer shows empty state
    }
  }

  return (
    <GalleryDrawerProvider>
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
        <div className="flex items-center gap-3">
          <CanvasCostChip canvasId={canvas.id} />
          <GalleryDrawerTrigger />
        </div>
      </header>

      <div className="relative flex-1">
        {/* load this canvas's nodes from the DB, seed the store, autosave changes */}
        <CanvasStoreProvider key={canvas.id} initialNodes={initialNodes} initialEdges={initialEdges} canvasName={canvas.name}>
          <Canvas
            canvasId={canvas.id}
            clientId={client.id}
            initialKBJob={latestKBJob}
            hasActiveKB={!!activeKBVersion}
            initialDriveRootFolder={initialDriveRootFolder}
          />
        </CanvasStoreProvider>
      </div>
    </main>
    </GalleryDrawerProvider>
  );
}
