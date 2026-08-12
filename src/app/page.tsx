import { listClients, listArchivedClients } from "@/lib/db/clients";
import { listRecentCanvases } from "@/lib/db/canvases";
import { ClientsHomeTabs } from "@/components/clients/clients-home-tabs";
import { resolveOrgId } from "@/lib/dal";

export const dynamic = "force-dynamic"; // always read fresh from the DB

export default async function ClientsPage() {
  const effectiveOrgId = await resolveOrgId();
  const [clients, archivedClients, recentCanvases] = await Promise.all([
    listClients(effectiveOrgId),
    listArchivedClients(effectiveOrgId),
    listRecentCanvases(effectiveOrgId),
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
