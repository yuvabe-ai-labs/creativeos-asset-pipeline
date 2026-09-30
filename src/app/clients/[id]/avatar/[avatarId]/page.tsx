import { redirect } from "next/navigation";
import { getClientBySlug } from "@/lib/db/clients";
import { resolveOrgId } from "@/lib/dal";
import { AvatarBreadcrumb } from "@/components/avatar/avatar-breadcrumb";
import { AvatarEditor } from "@/components/avatar/avatar-editor";

export const dynamic = "force-dynamic";

export default async function EditAvatarPage({
  params,
}: {
  params: Promise<{ id: string; avatarId: string }>;
}) {
  const { id, avatarId } = await params;
  const client = await getClientBySlug(id);
  const effectiveOrgId = await resolveOrgId();
  if (!client || client.org_id !== effectiveOrgId) redirect("/");

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-12">
      <AvatarBreadcrumb client={client} current="Edit avatar" />
      <AvatarEditor clientId={client.id} clientSlug={client.slug} avatarId={avatarId} />
    </main>
  );
}
