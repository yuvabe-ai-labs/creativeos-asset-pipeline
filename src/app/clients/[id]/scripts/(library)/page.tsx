import { loadClientPage } from "@/lib/permissions/page";
import Link from "next/link";
import { redirect } from "next/navigation";
import { listScriptDeleteBlocks, listScripts } from "@/lib/db/scripts";
import { listUnwrittenScripts } from "@/lib/db/script-generate";
import { listFeedbackCounts } from "@/lib/db/script-reviews";
import { ScriptsLibrary } from "@/components/scripts/scripts-library";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

export const dynamic = "force-dynamic";

export default async function ScriptsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; // `id` is the client slug
  const { client } = await loadClientPage(id, "view");

  const [scripts, unwritten, feedback, deleteBlocks] = await Promise.all([
    listScripts(client.id), listUnwrittenScripts(client.id), listFeedbackCounts(client.id), listScriptDeleteBlocks(client.id),
  ]);

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
      <ScriptsLibrary clientId={client.id} clientName={client.name} clientSlug={client.slug} scripts={scripts} unwritten={unwritten} feedback={feedback} deleteBlocks={deleteBlocks} />
    </main>
  );
}
