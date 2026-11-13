import { listClients, listArchivedClients } from "@/lib/db/clients";
import { listRecentCanvases } from "@/lib/db/canvases";
import { getOrgReviewCounts } from "@/lib/db/review";
import { ClientsHomeTabs } from "@/components/clients/clients-home-tabs";
import { resolveActingCaller, accessOf } from "@/lib/permissions/server";
import { clientIdsWith } from "@/lib/permissions/check";

export const dynamic = "force-dynamic"; // always read fresh from the DB

export default async function ClientsPage() {
  const { caller, effectiveOrgId } = await resolveActingCaller();
  const access = accessOf(caller);
  const clientIds = clientIdsWith(access, effectiveOrgId, "view");
  // R5.1: counts are seeded server-side so the first paint is already correct — no flash
  // of zero before the client hook's first fetch. Joins the existing parallel batch rather
  // than adding a serial await.
  const [clients, archivedClients, recentCanvases, reviewCounts] = await Promise.all([
    listClients(effectiveOrgId, clientIds),
    listArchivedClients(effectiveOrgId, clientIds),
    listRecentCanvases(effectiveOrgId, clientIds),
    getOrgReviewCounts(effectiveOrgId, clientIdsWith(access, effectiveOrgId, "approve")),
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
