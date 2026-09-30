import { redirect } from "next/navigation";
import { getClientBySlug } from "@/lib/db/clients";
import { resolveOrgId } from "@/lib/dal";
import { AvatarBreadcrumb } from "@/components/avatar/avatar-breadcrumb";
import { AvatarGallery } from "@/components/avatar/avatar-gallery";

export const dynamic = "force-dynamic";

export default async function AvatarsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = await getClientBySlug(id);
  const effectiveOrgId = await resolveOrgId();

  // Org isolation: a client outside the caller's org redirects the same as a
  // nonexistent one — mirrors the KB and Market pages' guard.
  if (!client || client.org_id !== effectiveOrgId) redirect("/");

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-12">
      <AvatarBreadcrumb client={client} />
      <AvatarGallery clientId={client.id} clientSlug={client.slug} />
    </main>
  );
}
