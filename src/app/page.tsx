import Link from "next/link";
import { listClients } from "@/lib/db/clients";
import { NewClientDialog } from "@/components/clients/new-client-dialog";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const dynamic = "force-dynamic"; // always read fresh from the DB

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export default async function ClientsPage() {
  const clients = await listClients();

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-14">
      <header className="animate-rise mb-10 flex items-end justify-between">
        <div>
          <p className="text-eyebrow">Increment 1D · persisted</p>
          <h1 className="mt-2 font-display text-5xl font-semibold tracking-[-0.02em]">
            Clients
          </h1>
        </div>
        <NewClientDialog />
      </header>

      {clients.length === 0 ? (
        <Card className="animate-rise flex flex-col items-center justify-center gap-2 border-dashed p-14 text-center">
          <p className="font-display text-lg font-medium">No clients yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Create one to get started — it now saves to the database and survives a refresh.
          </p>
        </Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {clients.map((client, i) => (
            <li
              key={client.id}
              className="animate-rise"
              style={{ animationDelay: `${80 + i * 45}ms` }}
            >
              <Link href={`/clients/${client.slug}`} className="group block">
                <Card className="shadow-card gap-0 overflow-hidden p-0 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:-translate-y-0.5 group-hover:scale-[1.006]">
                  <div className="flex h-28 items-center justify-center border-b bg-muted/40 p-5">
                    {client.logo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={client.logo_url}
                        alt={`${client.name} logo`}
                        className="max-h-full max-w-[70%] object-contain"
                      />
                    ) : (
                      <span className="font-display text-3xl font-semibold text-muted-foreground/40">
                        {initials(client.name)}
                      </span>
                    )}
                  </div>
                  <CardHeader className="py-4">
                    <CardTitle className="font-display text-xl">
                      {client.name}
                    </CardTitle>
                    <CardDescription>
                      {client.canvas_count} canvas
                      {client.canvas_count === 1 ? "" : "es"}
                    </CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
