import { listClients, listArchivedClients } from "@/lib/db/clients";
import { listRecentCanvases } from "@/lib/db/canvases";
import { getOrgReviewCounts } from "@/lib/db/review";
import { ClientsHomeTabs } from "@/components/clients/clients-home-tabs";
import { resolveOrgId } from "@/lib/dal";

export const dynamic = "force-dynamic"; // always read fresh from the DB

export default async function ClientsPage() {
  const effectiveOrgId = await resolveOrgId();
  // R5.1: counts are seeded server-side so the first paint is already correct — no flash
  // of zero before the client hook's first fetch. Joins the existing parallel batch rather
  // than adding a serial await.
  const [clients, archivedClients, recentCanvases, reviewCounts] = await Promise.all([
    listClients(effectiveOrgId),
    listArchivedClients(effectiveOrgId),
    listRecentCanvases(effectiveOrgId),
    getOrgReviewCounts(effectiveOrgId),
  ]);

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-14">
      <ClientsHomeTabs
        clients={clients}
        archivedClients={archivedClients}
        recentCanvases={recentCanvases}
        reviewCounts={reviewCounts}
      />
    </main>
  );
}
