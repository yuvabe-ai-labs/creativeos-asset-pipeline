import Link from "next/link";
import { getClientBySlug } from "@/lib/db/clients";
import { getCanvasBySlug } from "@/lib/db/canvases";
import { resolveOrgId } from "@/lib/dal";
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
import { ReviewDrawerProvider } from "@/components/canvas/review-drawer/review-drawer-context";
import { ReviewDrawerTrigger } from "@/components/canvas/review-drawer/review-drawer-trigger";
import { getOrgReviewCounts } from "@/lib/db/review";
import { CanvasCostChip } from "@/components/canvas/canvas-cost-chip";
import { listNodes } from "@/lib/db/nodes";
import { listEdges } from "@/lib/db/edges";
import { nodeRowToFlow } from "@/lib/canvas-nodes";
import { getLatestKBJob } from "@/lib/db/kb-jobs";
import { getActiveKBVersion } from "@/lib/db/kb";

export const dynamic = "force-dynamic";

export default async function CanvasPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; cid: string }>;
  searchParams: Promise<{ review?: string; node?: string }>;
}) {
  const { id, cid } = await params; // client slug, canvas slug
  // Read server-side rather than with useSearchParams — that hook opts its whole subtree
  // out of static rendering and would need a Suspense boundary around the canvas.
  //
  // `?review=1` now only opens the review drawer (below). It used to also tell <Canvas> to
  // skip the edit lock (D161); that is DEFERRED — see the ADR log — so entering a canvas
  // takes the lock again however you arrived.
  const { review, node } = await searchParams;
  const reviewMode = review === "1";
  const focusNodeId = typeof node === "string" && node ? node : null;
  const client = await getClientBySlug(id);
  const canvas = client ? await getCanvasBySlug(client.id, cid) : null;
  const effectiveOrgId = await resolveOrgId();

  // Org isolation: a canvas outside the caller's org renders as not-found, never
  // confirming a foreign org's canvas exists — see the note in ../../page.tsx.
  if (!client || !canvas || client.org_id !== effectiveOrgId) {
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

  const [initialNodes, initialEdges, latestKBJob, activeKBVersion, reviewCounts] =
    await Promise.all([
      listNodes(canvas.id).then((rows) => rows.map(nodeRowToFlow)),
      listEdges(canvas.id),
      getLatestKBJob(client.id),
      getActiveKBVersion(client.id),
      // R5.3: seeds the Review control's count so it is right on first paint.
      getOrgReviewCounts(effectiveOrgId),
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
    {/* D161: opens straight away when arrived at via a review link — the senior followed
        a count to get here, so the list should already be on screen. */}
    <ReviewDrawerProvider initialOpen={reviewMode}>
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
          <ReviewDrawerTrigger canvasId={canvas.id} initialCounts={reviewCounts} />
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
            focusNodeId={focusNodeId}
          />
        </CanvasStoreProvider>
      </div>
    </main>
    </ReviewDrawerProvider>
    </GalleryDrawerProvider>
  );
}
