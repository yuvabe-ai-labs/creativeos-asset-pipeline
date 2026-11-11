import Link from "next/link";
import { redirect } from "next/navigation";
import { loadClientPage } from "@/lib/permissions/page";
import { listCanvases } from "@/lib/db/canvases";
import { getOrgReviewCounts } from "@/lib/db/review";
import { accessOf } from "@/lib/permissions/server";
import { NewCanvasDialog } from "@/components/canvases/new-canvas-dialog";
import { CanvasesTable } from "@/components/canvases/canvases-table";
import { EmptyState } from "@/components/shared/empty-state";
import { ClientSettingsMenu } from "@/components/clients/client-settings-menu";
import { ClientIdentity } from "@/components/clients/client-identity";
import { Button } from "@/components/ui/button";
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
  const { client, caller, effectiveOrgId } = await loadClientPage(id, "canvases.view");

  if (client.kb_status !== "ready") {
    redirect(`/clients/${client.slug}/kb`);
  }

  // R5.2: seeded server-side alongside the canvases, so the first paint carries the right
  // numbers. Same RPC the client list uses — R5.5 holds at runtime, not just in the schema.
  const [canvases, reviewCounts] = await Promise.all([
    listCanvases(client.id),
    getOrgReviewCounts(effectiveOrgId, accessOf(caller)),
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

      <header className="animate-rise mb-10 mt-4 flex items-center justify-between gap-4">
        <ClientIdentity clientId={client.id} name={client.name} logoUrl={client.logo_url} />

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
