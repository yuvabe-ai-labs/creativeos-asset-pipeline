import { listClients, listArchivedClients } from "@/lib/db/clients";
import { listRecentCanvases } from "@/lib/db/canvases";
import { getOrgReviewCounts } from "@/lib/db/review";
import { ClientsHomeTabs } from "@/components/clients/clients-home-tabs";
import { resolveOrgId } from "@/lib/dal";
import { resolveActingCaller, accessOf } from "@/lib/permissions/server";
import { scopeIds } from "@/lib/permissions/check";

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
    resolveActingCaller().then(({ caller }) => getOrgReviewCounts(effectiveOrgId, scopeIds(accessOf(caller)))),
  ]);

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-12">
      <ClientsHomeTabs
        clients={clients}
        archivedClients={archivedClients}
        recentCanvases={recentCanvases}
        reviewCounts={reviewCounts}
      />
    </main>
  );
}
