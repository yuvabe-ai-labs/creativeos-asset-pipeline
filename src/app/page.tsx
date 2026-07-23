import { listClients, listArchivedClients } from "@/lib/db/clients";
import { listRecentCanvases } from "@/lib/db/canvases";
import { ClientsHomeTabs } from "@/components/clients/clients-home-tabs";
import { resolveCallerContext } from "@/lib/dal";

export const dynamic = "force-dynamic"; // always read fresh from the DB

export default async function ClientsPage() {
  const caller = await resolveCallerContext();
  const [clients, archivedClients, recentCanvases] = await Promise.all([
    listClients(caller.orgId),
    listArchivedClients(caller.orgId),
    listRecentCanvases(caller.orgId),
  ]);

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-14">
      <ClientsHomeTabs
        clients={clients}
        archivedClients={archivedClients}
        recentCanvases={recentCanvases}
      />
    </main>
  );
}
