import { redirect } from "next/navigation";
import { getClientBySlug } from "@/lib/db/clients";
import { getAvatar } from "@/lib/db/avatars";
import { resolveOrgId } from "@/lib/dal";
import { loadAvatarGenerations, loadVoicePreviewState } from "@/lib/avatars/studio-server";
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

  // Read with the avatar, so the Studio opens with its images and its preview's state already
  // known rather than showing an empty grid and a not-done Preview step while they load. Either
  // failing just leaves the browser to load it, as before.
  const [generations, voicePreview] = await Promise.all([
    loadAvatarGenerations(avatar.id).catch(() => null),
    loadVoicePreviewState(avatar).catch(() => null),
  ]);

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-12">
      {/* Keyed on the id so moving between avatars remounts the Studio's state cleanly. */}
      <AvatarStudio
        key={avatar.id}
        clientId={client.id}
        clientSlug={client.slug}
        clientName={client.name}
        initialAvatar={avatar}
        initialGenerations={generations}
        initialVoicePreview={voicePreview}
      />
    </main>
  );
}
