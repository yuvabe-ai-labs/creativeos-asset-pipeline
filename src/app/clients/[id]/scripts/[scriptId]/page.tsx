import { loadClientPage } from "@/lib/permissions/page";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getScript } from "@/lib/db/scripts";
import { getScriptCanvas } from "@/lib/db/canvases";
import { ScriptCanvasButton } from "@/components/scripts/script-canvas-button";
import { getGenerateScript, listCopilotAvatars, listScriptMessages, loadGenerateState } from "@/lib/db/script-generate";
import { scriptWaiting } from "@/lib/scripts/copilot/waiting";
import { CopilotChat } from "@/components/scripts/generate/copilot-chat";
import { listAvatars } from "@/lib/db/avatars";
import { scriptsLocked } from "@/lib/journey/stages";
import { redirectUnlessKbReady } from "@/lib/clients/kb-gate";
import { ScriptView } from "@/components/scripts/script-view";
import { ScriptBreadcrumb } from "@/components/scripts/script-breadcrumb";
import { GenerateWorkspace } from "@/components/scripts/generate/generate-workspace";
import { ApprovedReviewBoard } from "@/components/script-review/team/approved-review-board";
import { loadApprovedVersion, loadTeamReview } from "@/lib/script-review/load";
import { reelLabel } from "@/lib/scripts/utils";
import { VisualiseCopilotWorkspace } from "@/components/visualise/visualise-copilot-workspace";
import { loadVisualiseBoard } from "@/lib/scripts/visualise/board-server";
import { isVisualiseStage } from "@/lib/scripts/visualise/cast";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

export const dynamic = "force-dynamic";

export default async function ScriptPage({ params }: { params: Promise<{ id: string; scriptId: string }> }) {
  const { id, scriptId } = await params; // `id` is the client slug
  const { client } = await loadClientPage(id, "view");
  // D503: no scripts or avatars until the Brand KB is set up, the same rule as the canvases page.
  redirectUnlessKbReady(client);

  // Spec 2 — at Generate the script opens in the copilot workspace, with or without a draft yet.
  const atGenerate = await getGenerateScript(client.id, scriptId);
  if (atGenerate?.stage === "generate") {
    const state = await loadGenerateState(client.id, scriptId);
    if (!state) notFound();
    const doc = state.script.doc;
    // D489 — a reopened script the client commented on keeps those comments in a third column. The
    // page is the board's width either way, so the copilot sits where the stage guide does (D506).
    const loaded = doc ? await loadTeamReview({ id: scriptId, stage: "generate", doc }) : null;
    const review = loaded?.comments.some((c) => c.parentId === null) ? loaded : null;
    const reel = doc ? reelLabel(doc.header.reelNumber) : null;
    const title = doc ? `${reel ? `${reel} · ` : ""}${doc.header.title}` : state.script.brief.card?.title ?? "New script";
    return (
      <main className="mx-auto flex w-full max-w-[96rem] flex-1 flex-col px-6 py-8">
        <ScriptBreadcrumb client={client} title={title} />
        <GenerateWorkspace client={{ id: client.id, name: client.name, slug: client.slug }} initialState={state} initialReview={review} locked={scriptsLocked(client)} />
      </main>
    );
  }

  const script = await getScript(client.id, scriptId);
  if (!script) notFound();

  // Spec 3 — Visualise and In review show the Visualise view, with spec 4's review on it; an approved
  // script with a review shows the approved version (spec 4, 4.17); other stages the read-only view.
  // One round trip for what does not depend on each other: the stage's own view, the approved
  // script's canvas, and the script's saved copilot thread with the avatars its cards show (piece
  // 4.1). At Visualise and In review the thread seeds the panel's live state (piece 5.1); after
  // that it goes to the read-only panel as props, so the browser makes no request for it.
  const visualising = isVisualiseStage(script.stage);
  const [board, approved, scriptCanvas, copilotState, messages, copilotAvatars] = await Promise.all([
    visualising ? loadVisualiseBoard(client.id, script) : null,
    script.stage === "approved" ? loadApprovedVersion(script.id) : null,
    // D372 — an approved script's canvas: Create canvas, or Open canvas once it has one.
    script.stage === "approved" ? getScriptCanvas(client.id, script.id) : null,
    visualising ? loadGenerateState(client.id, script.id) : null,
    visualising ? [] : listScriptMessages(client.id, script.id),
    visualising ? [] : listCopilotAvatars(client.id),
  ]);
  // Seeds the team's review query, so the board draws its Comments column at once (no reflow).
  const review = board || approved ? await loadTeamReview(script) : null;
  // Faces for the read-only cast: only this client's live avatars, so another client's id shows no face.
  const avatarFaces = board || approved
    ? {}
    : Object.fromEntries((await listAvatars(client.id)).map((a) => [a.id, a.front?.url ?? null]));
  const label = reelLabel(script.doc.header.reelNumber);
  const canvasAction = script.stage === "approved" ? (
    // Keyed: a server-made element rendered among a client component's children otherwise trips
    // React's list-key check in development.
    <ScriptCanvasButton
      key="script-canvas"
      clientId={client.id}
      clientSlug={client.slug}
      script={{ id: script.id, title: `${label ? `${label} · ` : ""}${script.doc.header.title}` }}
      canvas={scriptCanvas ? { slug: scriptCanvas.slug } : null}
    />
  ) : null;
  const waiting = script.stage === "approved" ? scriptWaiting({ stage: "approved", hasCanvas: Boolean(scriptCanvas) }) : null;

  return (
    <main className="mx-auto w-full max-w-[96rem] flex-1 px-6 py-12">
      <Breadcrumb className="animate-rise mb-6 shrink-0">
        <BreadcrumbList>
          {/* A script has no client bar above it (frame.ts), so this trail is the whole way back. */}
          <BreadcrumbItem><BreadcrumbLink render={<Link href="/">Clients</Link>} /></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbLink render={<Link href={`/clients/${client.slug}`}>{client.name}</Link>} /></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbLink render={<Link href={`/clients/${client.slug}/scripts`}>Scripts</Link>} /></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>{label ? `${label} · ` : ""}{script.doc.header.title}</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      {board && copilotState ? (
        // Piece 5.1 — the copilot beside the storyboard, sharing its draws and actions.
        <VisualiseCopilotWorkspace
          client={{ id: client.id, name: client.name, slug: client.slug }}
          initialState={copilotState}
          initialBoard={{ script, board }}
          initialReview={review!}
        />
      ) : (
        // An approved script: the copilot read-only beside it, folded until opened (spec §3.2).
        <div className="grid items-start gap-6 lg:grid-cols-[auto_minmax(0,1fr)]">
          <CopilotChat
            client={{ name: client.name, slug: client.slug }}
            scriptId={script.id}
            stage={script.stage}
            messages={messages}
            avatars={copilotAvatars}
            waiting={waiting}
            live={null}
          />
          <div className="min-w-0">
            {approved ? (
              <ApprovedReviewBoard clientId={client.id} script={script} version={approved} initialReview={review!} canvasAction={canvasAction} />
            ) : (
              // The plain read-only view keeps the narrower width it always had.
              <div className="mx-auto w-full max-w-6xl">
                {canvasAction && <div className="mb-4 flex justify-end">{canvasAction}</div>}
                <ScriptView script={script} avatarFaces={avatarFaces} />
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
