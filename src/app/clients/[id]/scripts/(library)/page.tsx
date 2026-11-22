import { redirect } from "next/navigation";
import { getClientBySlug } from "@/lib/db/clients";
import { listScriptDeleteBlocks, listScripts } from "@/lib/db/scripts";
import { listUnwrittenScripts } from "@/lib/db/script-generate";
import { listFeedbackCounts } from "@/lib/db/script-reviews";
import { resolveOrgId } from "@/lib/dal";
import { scriptsLocked } from "@/lib/journey/stages";
import { redirectUnlessKbReady } from "@/lib/clients/kb-gate";
import { ScriptsLibrary } from "@/components/scripts/scripts-library";

export const dynamic = "force-dynamic";

export default async function ScriptsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; // `id` is the client slug
  const client = await getClientBySlug(id);
  const effectiveOrgId = await resolveOrgId();
  // Org isolation, as the Avatars page: a client outside the caller's org redirects like a missing one.
  if (!client || client.org_id !== effectiveOrgId) redirect("/");
  // D503: no scripts or avatars until the Brand KB is set up, the same rule as the canvases page.
  redirectUnlessKbReady(client);

  const [scripts, unwritten, feedback, deleteBlocks] = await Promise.all([
    listScripts(client.id), listUnwrittenScripts(client.id), listFeedbackCounts(client.id), listScriptDeleteBlocks(client.id),
  ]);

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 pb-12 pt-4">
      <ScriptsLibrary clientId={client.id} clientName={client.name} clientSlug={client.slug} scripts={scripts} unwritten={unwritten} feedback={feedback} deleteBlocks={deleteBlocks} locked={scriptsLocked(client)} />
    </main>
  );
}
