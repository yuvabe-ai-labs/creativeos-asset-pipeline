import { redirect } from "next/navigation";
import { getClientBySlug } from "@/lib/db/clients";
import { resolveOrgId } from "@/lib/dal";
import { AvatarBreadcrumb } from "@/components/avatar/avatar-breadcrumb";
import { AvatarView } from "@/components/avatar/avatar-view";

export const dynamic = "force-dynamic";

export default async function NewAvatarPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = await getClientBySlug(id);
  const effectiveOrgId = await resolveOrgId();
  if (!client || client.org_id !== effectiveOrgId) redirect("/");

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-12">
      <AvatarBreadcrumb client={client} current="Create avatar" />
      <AvatarView clientId={client.id} clientSlug={client.slug} />
    </main>
  );
}
