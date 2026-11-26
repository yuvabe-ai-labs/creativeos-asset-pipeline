import { loadClientPage } from "@/lib/permissions/page";
import { listScriptDeleteBlocks, listScripts } from "@/lib/db/scripts";
import { listUnwrittenScripts } from "@/lib/db/script-generate";
import { listFeedbackCounts } from "@/lib/db/script-reviews";
import { scriptsLocked } from "@/lib/journey/stages";
import { redirectUnlessKbReady } from "@/lib/clients/kb-gate";
import { ScriptsLibrary } from "@/components/scripts/scripts-library";

export const dynamic = "force-dynamic";

export default async function ScriptsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; // `id` is the client slug
  const { client } = await loadClientPage(id, "view");
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
