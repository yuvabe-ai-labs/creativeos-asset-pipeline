import Link from "next/link";
import { redirect } from "next/navigation";
import { getClientBySlug } from "@/lib/db/clients";
import { resolveOrgId } from "@/lib/dal";
import { MarketView } from "@/components/market/market-view";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { canApproveMarket, journeyState } from "@/lib/journey/stages";

export const dynamic = "force-dynamic";

export default async function MarketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = await getClientBySlug(id);
  const effectiveOrgId = await resolveOrgId();

  // Org isolation: a client outside the caller's org redirects the same as a
  // nonexistent one — mirrors the KB page's guard.
  if (!client || client.org_id !== effectiveOrgId) redirect("/");
  const state = journeyState(client);

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 pb-12 pt-4">

      {state.market === "locked" ? (
        // Copilot journey spec §5.2: market research opens once a person approves the brand KB.
        <div className="mt-8">
          <EmptyState
            title="Market research is locked"
            body="It opens once the brand KB is approved."
            action={
              <Button
                variant="outline"
                nativeButton={false}
                render={<Link href={`/clients/${client.slug}/kb`}>Go to brand KB</Link>}
              />
            }
          />
        </div>
      ) : (
        <MarketView
          clientId={client.id}
          clientName={client.name}
          clientSlug={client.slug}
          approval={{ approved: state.market === "approved", canApprove: canApproveMarket(client) }}
        />
      )}
    </main>
  );
}
