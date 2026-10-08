import Link from "next/link";
import { redirect } from "next/navigation";
import { getClientBySlug } from "@/lib/db/clients";
import { listScripts } from "@/lib/db/scripts";
import { listFeedbackCounts } from "@/lib/db/script-reviews";
import { resolveOrgId } from "@/lib/dal";
import { ScriptsLibrary } from "@/components/scripts/scripts-library";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

export const dynamic = "force-dynamic";

export default async function ScriptsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; // `id` is the client slug
  const client = await getClientBySlug(id);
  const effectiveOrgId = await resolveOrgId();
  // Org isolation, as the Avatars page: a client outside the caller's org redirects like a missing one.
  if (!client || client.org_id !== effectiveOrgId) redirect("/");

  const [scripts, feedback] = await Promise.all([listScripts(client.id), listFeedbackCounts(client.id)]);

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-12">
      <Breadcrumb className="animate-rise shrink-0">
        <BreadcrumbList>
          <BreadcrumbItem><BreadcrumbLink render={<Link href="/">Clients</Link>} /></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbLink render={<Link href={`/clients/${client.slug}`}>{client.name}</Link>} /></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>Scripts</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <ScriptsLibrary clientName={client.name} clientSlug={client.slug} scripts={scripts} feedback={feedback} />
    </main>
  );
}
