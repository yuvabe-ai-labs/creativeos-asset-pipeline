import { redirect } from "next/navigation";
import { getClientBySlug } from "@/lib/db/clients";
import { resolveOrgId } from "@/lib/dal";
import { AvatarStudio } from "@/components/avatars/avatar-studio";

export const dynamic = "force-dynamic";

// No avatar row exists yet: the Studio creates the draft at the first upload (D287).
export default async function NewAvatarPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; // `id` is the client slug
  const client = await getClientBySlug(id);
  const effectiveOrgId = await resolveOrgId();
  if (!client || client.org_id !== effectiveOrgId) redirect("/");

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-12">
      <AvatarStudio
        clientId={client.id}
        clientSlug={client.slug}
        clientName={client.name}
        initialAvatar={null}
      />
    </main>
  );
}
