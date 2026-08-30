import Link from "next/link";
import { redirect } from "next/navigation";
import { getClientBySlug } from "@/lib/db/clients";
import { listCanvases } from "@/lib/db/canvases";
import { getOrgReviewCounts } from "@/lib/db/review";
import { resolveOrgId } from "@/lib/dal";
import { NewCanvasDialog } from "@/components/canvases/new-canvas-dialog";
import { CanvasesTable } from "@/components/canvases/canvases-table";
import { EmptyState } from "@/components/shared/empty-state";
import { ClientSettingsMenu } from "@/components/clients/client-settings-menu";
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

export const dynamic = "force-dynamic";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export default async function ClientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params; // `id` is the client slug
  const client = await getClientBySlug(id);
  const effectiveOrgId = await resolveOrgId();

  // Org isolation: a client outside the caller's org renders as not-found, never
  // confirming a foreign org's client exists — same rule as withClient() in
  // route-helpers.ts, applied here since this page bypasses that helper.
  if (!client || client.org_id !== effectiveOrgId) {
    return (
      <main className="mx-auto flex w-full max-w-4xl flex-1 items-center justify-center px-6 py-12">
        <Card className="flex min-w-[26rem] flex-col items-center gap-3 border-dashed p-16 text-center">
          <p className="font-display text-2xl font-medium">Client not found</p>
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

  if (client.kb_status !== "ready") {
    redirect(`/clients/${client.slug}/kb`);
  }

  // R5.2: seeded server-side alongside the canvases, so the first paint carries the right
  // numbers. Same RPC the client list uses — R5.5 holds at runtime, not just in the schema.
  const [canvases, reviewCounts] = await Promise.all([
    listCanvases(client.id),
    getOrgReviewCounts(effectiveOrgId),
  ]);

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-12">
      <Breadcrumb className="animate-rise">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/">Clients</Link>} />
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{client.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <header className="animate-rise mb-10 mt-4 flex items-end justify-between gap-4">
        <div className="flex items-end gap-4">
          {client.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={client.logo_url}
              alt={`${client.name} logo`}
              className="size-14 shrink-0 rounded-lg border bg-card object-contain p-1.5"
            />
          ) : (
            <span className="flex size-14 shrink-0 items-center justify-center rounded-lg border bg-card font-display text-xl font-semibold text-muted-foreground/50">
              {initials(client.name)}
            </span>
          )}
          <h1 className="font-display text-4xl font-semibold tracking-[-0.02em]">
            {client.name}
          </h1>
        </div>

        <div className="flex shrink-0 items-end gap-2">
          <ClientSettingsMenu slug={client.slug} />
          <NewCanvasDialog clientId={client.id} clientSlug={client.slug} />
        </div>
      </header>

      {canvases.length === 0 ? (
        <EmptyState
          title="No canvases yet"
          body="A canvas is one reel project — script, shots, prompts, images and clips on a single board."
          action={
            <NewCanvasDialog
              clientId={client.id}
              clientSlug={client.slug}
              trigger={<Button>+ New canvas</Button>}
            />
          }
        />
      ) : (
        <div className="animate-rise">
          <CanvasesTable
            canvases={canvases}
            clientSlug={client.slug}
            reviewCounts={reviewCounts}
          />
        </div>
      )}
    </main>
  );
}
