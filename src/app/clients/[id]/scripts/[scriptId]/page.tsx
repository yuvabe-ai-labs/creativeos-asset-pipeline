import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getClientBySlug } from "@/lib/db/clients";
import { getScript } from "@/lib/db/scripts";
import { getGenerateScript, loadGenerateState } from "@/lib/db/script-generate";
import { listAvatars } from "@/lib/db/avatars";
import { resolveOrgId } from "@/lib/dal";
import { ScriptView } from "@/components/scripts/script-view";
import { ScriptBreadcrumb } from "@/components/scripts/script-breadcrumb";
import { GenerateWorkspace } from "@/components/scripts/generate/generate-workspace";
import { ApprovedReviewBoard } from "@/components/script-review/team/approved-review-board";
import { loadApprovedVersion, loadTeamReview } from "@/lib/script-review/load";
import { reelLabel } from "@/lib/scripts/utils";
import { cn } from "@/lib/utils";
import { TeamReviewBoard } from "@/components/script-review/team/team-review-board";
import { loadVisualiseBoard } from "@/lib/scripts/visualise/board-server";
import { isVisualiseStage } from "@/lib/scripts/visualise/cast";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

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

  // Spec 3 — Visualise and In review show the Visualise view, with spec 4's review on it; an approved
  // script with a review shows the approved version (spec 4, 4.17); other stages the read-only view.
  const board = isVisualiseStage(script.stage) ? await loadVisualiseBoard(client.id, script) : null;
  const approved = script.stage === "approved" ? await loadApprovedVersion(script.id) : null;
  // Seeds the team's review query, so the board draws its Comments column at once (no reflow).
  const review = board || approved ? await loadTeamReview(script) : null;
  // Faces for the read-only cast: only this client's live avatars, so another client's id shows no face.
  const avatarFaces = board || approved
    ? {}
    : Object.fromEntries((await listAvatars(client.id)).map((a) => [a.id, a.front?.url ?? null]));
  const label = reelLabel(script.doc.header.reelNumber);

  return (
    <main className={cn("mx-auto w-full flex-1 px-6 py-12", board || approved ? "max-w-[96rem]" : "max-w-6xl")}>
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
      {board ? (
        <TeamReviewBoard clientId={client.id} initial={{ script, board }} initialReview={review!} />
      ) : approved ? (
        <ApprovedReviewBoard clientId={client.id} script={script} version={approved} initialReview={review!} />
      ) : (
        <ScriptView script={script} avatarFaces={avatarFaces} />
      )}
    </main>
  );
}
