import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getClientBySlug } from "@/lib/db/clients";
import { getScript } from "@/lib/db/scripts";
import { listAvatars } from "@/lib/db/avatars";
import { resolveOrgId } from "@/lib/dal";
import { ScriptView } from "@/components/scripts/script-view";
import { reelLabel } from "@/lib/scripts/utils";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

export const dynamic = "force-dynamic";

export default async function ScriptPage({ params }: { params: Promise<{ id: string; scriptId: string }> }) {
  const { id, scriptId } = await params; // `id` is the client slug
  const client = await getClientBySlug(id);
  const effectiveOrgId = await resolveOrgId();
  if (!client || client.org_id !== effectiveOrgId) redirect("/");

  const script = await getScript(client.id, scriptId);
  if (!script) notFound();

  // Faces for the cast: only this client's live avatars, so another client's id shows no face.
  const avatars = await listAvatars(client.id);
  const avatarFaces = Object.fromEntries(avatars.map((a) => [a.id, a.front?.url ?? null]));
  const label = reelLabel(script.doc.header.reelNumber);

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-12">
      <Breadcrumb className="animate-rise mb-6 shrink-0">
        <BreadcrumbList>
          <BreadcrumbItem><BreadcrumbLink render={<Link href="/">Clients</Link>} /></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbLink render={<Link href={`/clients/${client.slug}`}>{client.name}</Link>} /></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbLink render={<Link href={`/clients/${client.slug}/scripts`}>Scripts</Link>} /></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>{label ? `${label} · ` : ""}{script.doc.header.title}</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <ScriptView script={script} avatarFaces={avatarFaces} />
    </main>
  );
}
