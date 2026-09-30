import { redirect } from "next/navigation";
import { getClientBySlug } from "@/lib/db/clients";
import { getAvatar } from "@/lib/db/avatars";
import { resolveOrgId } from "@/lib/dal";
import { AvatarStudio } from "@/components/avatars/avatar-studio";

export const dynamic = "force-dynamic";

export default async function AvatarPage({
  params,
}: {
  params: Promise<{ id: string; avatarId: string }>;
}) {
  const { id, avatarId } = await params; // `id` is the client slug
  const client = await getClientBySlug(id);
  const effectiveOrgId = await resolveOrgId();
  if (!client || client.org_id !== effectiveOrgId) redirect("/");

  // Missing, another client's, or archived: back to the library, never confirming it exists.
  const avatar = await getAvatar(client.id, avatarId);
  if (!avatar || avatar.archivedAt) redirect(`/clients/${client.slug}/avatars`);

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-12">
      {/* Keyed on the id so moving between avatars remounts the Studio's state cleanly. */}
      <AvatarStudio
        key={avatar.id}
        clientId={client.id}
        clientSlug={client.slug}
        clientName={client.name}
        initialAvatar={avatar}
      />
    </main>
  );
}
