import { redirect } from "next/navigation";
import { getClientBySlug } from "@/lib/db/clients";
import { listAvatars } from "@/lib/db/avatars";
import { resolveOrgId } from "@/lib/dal";
import { redirectUnlessKbReady } from "@/lib/clients/kb-gate";
import { AvatarsLibrary } from "@/components/avatars/avatars-library";

export const dynamic = "force-dynamic";

export default async function AvatarsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; // `id` is the client slug
  const client = await getClientBySlug(id);
  const effectiveOrgId = await resolveOrgId();

  // Org isolation: a client outside the caller's org redirects the same as a nonexistent
  // one — mirrors the Market page's guard.
  if (!client || client.org_id !== effectiveOrgId) redirect("/");
  // D503: no scripts or avatars until the Brand KB is set up, the same rule as the canvases page.
  redirectUnlessKbReady(client);

  const avatars = await listAvatars(client.id);

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 pb-12 pt-4">

      <AvatarsLibrary clientName={client.name} clientSlug={client.slug} avatars={avatars} />
    </main>
  );
}
