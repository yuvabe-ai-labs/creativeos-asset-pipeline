import { redirect } from "next/navigation";
import { getClientBySlug } from "@/lib/db/clients";
import { resolveOrgId } from "@/lib/dal";
import { MarketView } from "@/components/market/market-view";
import { ClientSectionNav } from "@/components/clients/client-section-nav";

export const dynamic = "force-dynamic";

export default async function MarketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = await getClientBySlug(id);
  const effectiveOrgId = await resolveOrgId();

  // Org isolation: a client outside the caller's org redirects the same as a
  // nonexistent one — mirrors the KB page's guard.
  if (!client || client.org_id !== effectiveOrgId) redirect("/");

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
      <ClientSectionNav slug={client.slug} active="market" />
      <MarketView clientId={client.id} clientName={client.name} clientSlug={client.slug} />
    </main>
  );
}
