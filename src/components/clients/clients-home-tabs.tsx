"use client";

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { NewClientDialog } from "@/components/clients/new-client-dialog";
import { ClientsTable } from "@/components/clients/clients-table";
import { RecentCanvasesTable } from "@/components/canvases/recent-canvases-table";
import { useReviewCounts } from "@/hooks/use-review-counts";
import type { ClientWithCount } from "@/lib/db/clients";
import type { RecentCanvas } from "@/lib/db/recent-canvas";
import type { ReviewCounts } from "@/lib/review/queue";

const triggerClass =
  "flex-none px-0 py-0 font-display text-3xl font-semibold tracking-[-0.02em] text-foreground/40 data-active:text-foreground sm:text-4xl";

// Archived is a recovery view, not a primary destination — so it's demoted from a big
// display tab to a quiet, right-aligned utility label (hierarchy via casing/scale/color,
// per the design system), pushed to the row's right edge with `ml-auto`.
const archivedTriggerClass =
  "ml-auto flex-none self-end px-0 py-0 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground data-active:text-foreground";

export function ClientsHomeTabs({
  clients,
  archivedClients,
  recentCanvases,
  reviewCounts,
}: {
  clients: ClientWithCount[];
  archivedClients: ClientWithCount[];
  recentCanvases: RecentCanvas[];
  reviewCounts: ReviewCounts;
}) {
  const [tab, setTab] = useState("clients");
  // R8.1/R8.2: ONE subscription for the whole page, not one per row. Seeded from the
  // server value so the first paint is already correct.
  const liveCounts = useReviewCounts(reviewCounts);

  return (
    <Tabs value={tab} onValueChange={setTab}>
      <header className="animate-rise mb-10">
        <div className="flex items-end gap-4">
          <TabsList variant="line" className="h-auto w-auto flex-1 gap-6 p-0">
            <TabsTrigger value="clients" className={triggerClass}>
              Clients
            </TabsTrigger>
            <TabsTrigger value="recent" className={triggerClass}>
              Recent
            </TabsTrigger>
            <TabsTrigger value="archived" className={archivedTriggerClass}>
              <span>Archived</span>
              {archivedClients.length > 0 && (
                <span className="tracking-normal tabular-nums text-muted-foreground/60">
                  {archivedClients.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
          {tab === "clients" && <NewClientDialog />}
        </div>
      </header>

      <TabsContent value="clients" className="animate-rise">
        {clients.length === 0 ? (
          <EmptyState
            title="No clients yet"
            body="A client keeps every brand document, canvas, and asset siloed under one account — set it up once and reuse it across every reel."
            action={<NewClientDialog trigger={<Button>+ Add client</Button>} />}
          />
        ) : (
          <ClientsTable clients={clients} counts={liveCounts.byClient} />
        )}
      </TabsContent>

      <TabsContent value="recent" className="animate-rise">
        {recentCanvases.length === 0 ? (
          <Card className="flex flex-col items-center justify-center gap-2 border-dashed p-14 text-center">
            <p className="font-display text-lg font-medium">No canvases yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Open a client and create a canvas — your most recently edited canvases will show up here.
            </p>
          </Card>
        ) : (
          <RecentCanvasesTable canvases={recentCanvases} />
        )}
      </TabsContent>

      <TabsContent value="archived" className="animate-rise">
        {archivedClients.length === 0 ? (
          <Card className="flex flex-col items-center justify-center gap-2 border-dashed p-14 text-center">
            <p className="font-display text-lg font-medium">No archived clients</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Archive a client from its ⋯ menu and it will move here — you can
              restore it anytime.
            </p>
          </Card>
        ) : (
          <ClientsTable clients={archivedClients} archived />
        )}
      </TabsContent>
    </Tabs>
  );
}
