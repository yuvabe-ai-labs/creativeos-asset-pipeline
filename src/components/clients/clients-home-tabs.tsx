"use client";

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { NewClientDialog } from "@/components/clients/new-client-dialog";
import { ClientsTable } from "@/components/clients/clients-table";
import { RecentCanvasesTable } from "@/components/canvases/recent-canvases-table";
import type { ClientWithCount } from "@/lib/db/clients";
import type { RecentCanvas } from "@/lib/db/recent-canvas";

const triggerClass =
  "flex-none px-0 py-0 font-display text-3xl font-semibold tracking-[-0.02em] text-foreground/40 data-active:text-foreground sm:text-4xl";

export function ClientsHomeTabs({
  clients,
  archivedClients,
  recentCanvases,
}: {
  clients: ClientWithCount[];
  archivedClients: ClientWithCount[];
  recentCanvases: RecentCanvas[];
}) {
  const [tab, setTab] = useState("clients");

  return (
    <Tabs value={tab} onValueChange={setTab}>
      <header className="animate-rise mb-10">
        <p className="text-eyebrow">Increment 1D · persisted</p>
        <div className="mt-2 flex items-end justify-between gap-4">
          <TabsList variant="line" className="h-auto gap-6 p-0">
            <TabsTrigger value="clients" className={triggerClass}>
              Clients
            </TabsTrigger>
            <TabsTrigger value="recent" className={triggerClass}>
              Recent
            </TabsTrigger>
            <TabsTrigger value="archived" className={triggerClass}>
              Archived
            </TabsTrigger>
          </TabsList>
          {tab === "clients" && <NewClientDialog />}
        </div>
      </header>

      <TabsContent value="clients" className="animate-rise">
        {clients.length === 0 ? (
          <Card className="flex flex-col items-center justify-center gap-2 border-dashed p-14 text-center">
            <p className="font-display text-lg font-medium">No clients yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Create one to get started — it now saves to the database and survives a refresh.
            </p>
          </Card>
        ) : (
          <ClientsTable clients={clients} />
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
