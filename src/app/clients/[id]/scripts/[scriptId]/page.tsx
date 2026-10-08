import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getClientBySlug } from "@/lib/db/clients";
import { getScript } from "@/lib/db/scripts";
import { listAvatars } from "@/lib/db/avatars";
import { resolveOrgId } from "@/lib/dal";
import { ScriptView } from "@/components/scripts/script-view";
import { reelLabel } from "@/lib/scripts/utils";
import { cn } from "@/lib/utils";
import { VisualiseView } from "@/components/visualise/visualise-view";
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

  const script = await getScript(client.id, scriptId);
  if (!script) notFound();

  // Spec 3 — Visualise and In review show the Visualise view; other stages the read-only view.
  const board = isVisualiseStage(script.stage) ? await loadVisualiseBoard(client.id, script) : null;
  // Faces for the read-only cast: only this client's live avatars, so another client's id shows no face.
  const avatarFaces = board
    ? {}
    : Object.fromEntries((await listAvatars(client.id)).map((a) => [a.id, a.front?.url ?? null]));
  const label = reelLabel(script.doc.header.reelNumber);

  return (
    <main className={cn("mx-auto w-full flex-1 px-6 py-12", board ? "max-w-7xl" : "max-w-6xl")}>
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
      {board
        ? <VisualiseView clientId={client.id} initial={{ script, board }} />
        : <ScriptView script={script} avatarFaces={avatarFaces} />}
    </main>
  );
}
