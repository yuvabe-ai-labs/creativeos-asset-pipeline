import { notFound, redirect } from "next/navigation";
import { getClientBySlug } from "@/lib/db/clients";
import { getScript } from "@/lib/db/scripts";
import { getGenerateScript, loadGenerateState } from "@/lib/db/script-generate";
import { listAvatars } from "@/lib/db/avatars";
import { resolveOrgId } from "@/lib/dal";
import { ScriptView } from "@/components/scripts/script-view";
import { ScriptBreadcrumb } from "@/components/scripts/script-breadcrumb";
import { GenerateWorkspace } from "@/components/scripts/generate/generate-workspace";
import { reelLabel } from "@/lib/scripts/utils";

export const dynamic = "force-dynamic";

export default async function ScriptPage({ params }: { params: Promise<{ id: string; scriptId: string }> }) {
  const { id, scriptId } = await params; // `id` is the client slug
  const client = await getClientBySlug(id);
  const effectiveOrgId = await resolveOrgId();
  if (!client || client.org_id !== effectiveOrgId) redirect("/");

  // Spec 2 — at Generate the script opens in the copilot workspace, with or without a draft yet.
  const atGenerate = await getGenerateScript(client.id, scriptId);
  if (atGenerate?.stage === "generate") {
    const state = await loadGenerateState(client.id, scriptId);
    if (!state) notFound();
    const doc = state.script.doc;
    const reel = doc ? reelLabel(doc.header.reelNumber) : null;
    const title = doc ? `${reel ? `${reel} · ` : ""}${doc.header.title}` : state.script.brief.card?.title ?? "New script";
    return (
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-6 py-8">
        <ScriptBreadcrumb client={client} title={title} />
        <GenerateWorkspace clientId={client.id} initialState={state} />
      </main>
    );
  }

  const script = await getScript(client.id, scriptId);
  if (!script) notFound();

  // Faces for the cast: only this client's live avatars, so another client's id shows no face.
  const avatars = await listAvatars(client.id);
  const avatarFaces = Object.fromEntries(avatars.map((a) => [a.id, a.front?.url ?? null]));
  const label = reelLabel(script.doc.header.reelNumber);

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-12">
      <ScriptBreadcrumb client={client} title={`${label ? `${label} · ` : ""}${script.doc.header.title}`} />
      <ScriptView script={script} avatarFaces={avatarFaces} />
    </main>
  );
}
