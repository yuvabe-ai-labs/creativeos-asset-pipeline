import { listClients } from "@/lib/db/clients";
import { NewClientDialog } from "@/components/clients/new-client-dialog";
import { ClientsTable } from "@/components/clients/clients-table";
import { Card } from "@/components/ui/card";

export const dynamic = "force-dynamic"; // always read fresh from the DB

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
        <div className="animate-rise">
          <ClientsTable clients={clients} />
        </div>
      )}
    </main>
  );
}
