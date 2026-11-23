import { loadClientPage } from "@/lib/permissions/page";
import { listAvatars } from "@/lib/db/avatars";
import { redirectUnlessKbReady } from "@/lib/clients/kb-gate";
import { AvatarsLibrary } from "@/components/avatars/avatars-library";

export const dynamic = "force-dynamic";

export default async function AvatarsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; // `id` is the client slug
  const { client } = await loadClientPage(id, "view");
  // D503: no scripts or avatars until the Brand KB is set up, the same rule as the canvases page.
  redirectUnlessKbReady(client);

  const avatars = await listAvatars(client.id);

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 pb-12 pt-4">

      <AvatarsLibrary clientName={client.name} clientSlug={client.slug} avatars={avatars} />
    </main>
  );
}
