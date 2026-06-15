import { listClients } from "@/lib/db/clients";
import { listRecentCanvases } from "@/lib/db/canvases";
import { ClientsHomeTabs } from "@/components/clients/clients-home-tabs";

export const dynamic = "force-dynamic"; // always read fresh from the DB

export default async function ClientsPage() {
  const [clients, recentCanvases] = await Promise.all([
    listClients(),
    listRecentCanvases(),
  ]);

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-14">
      <ClientsHomeTabs clients={clients} recentCanvases={recentCanvases} />
    </main>
  );
}
