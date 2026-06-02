import Link from "next/link";
import { getClientBySlug } from "@/lib/db/clients";
import { listCanvases } from "@/lib/db/canvases";
import { NewCanvasDialog } from "@/components/canvases/new-canvas-dialog";
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

  if (!client) {
    return (
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-12">
        <Card className="flex flex-col items-center gap-2 border-dashed p-12 text-center">
          <p className="font-display text-lg font-medium">Client not found</p>
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

  const canvases = await listCanvases(client.id);

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

      <header className="animate-rise mb-10 mt-4 flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          {client.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={client.logo}
              alt={`${client.name} logo`}
              className="size-14 shrink-0 rounded-lg border bg-card object-contain p-1.5"
            />
          ) : (
            <span className="flex size-14 shrink-0 items-center justify-center rounded-lg border bg-card font-display text-xl font-semibold text-muted-foreground/50">
              {initials(client.name)}
            </span>
          )}
          <div>
            <h1 className="font-display text-4xl font-semibold tracking-[-0.02em]">
              {client.name}
            </h1>
            {client.context_notes && (
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
                {client.context_notes}
              </p>
            )}
          </div>
        </div>

        <NewCanvasDialog clientId={client.id} clientSlug={client.slug} />
      </header>

      {canvases.length === 0 ? (
        <Card className="animate-rise flex flex-col items-center gap-2 border-dashed p-14 text-center">
          <p className="font-display text-lg font-medium">No canvases yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            A canvas is one creative project. Create one to open the editor.
          </p>
        </Card>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {canvases.map((canvas, i) => (
            <li
              key={canvas.id}
              className="animate-rise"
              style={{ animationDelay: `${80 + i * 45}ms` }}
            >
              <Link
                href={`/clients/${client.slug}/canvases/${canvas.slug}`}
                className="group block"
              >
                <Card className="shadow-card p-6 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:-translate-y-0.5 group-hover:scale-[1.006]">
                  <span className="font-display text-xl font-medium">
                    {canvas.name}
                  </span>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
