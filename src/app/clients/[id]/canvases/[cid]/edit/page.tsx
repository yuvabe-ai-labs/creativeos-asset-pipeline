import { getClientBySlug } from "@/lib/db/clients";
import { getCanvasBySlug } from "@/lib/db/canvases";
import { resolveOrgId } from "@/lib/dal";
import { loadEditorState } from "@/lib/editor/load-state";
import { EditorEmpty } from "@/components/editor/editor-empty";
import { EditorShell } from "@/components/editor/editor-shell";

export const dynamic = "force-dynamic";

// D388 — the Rough Cut Editor, a full page at the canvas URL plus /edit. Loads the edit and all
// its sources in one server read (spec §10's call budget); the page then holds the canvas lock.
export default async function EditorPage({ params }: { params: Promise<{ id: string; cid: string }> }) {
  const { id, cid } = await params; // client slug, canvas slug
  const canvasPath = `/clients/${id}/canvases/${cid}`;
  const client = await getClientBySlug(id);
  const canvas = client ? await getCanvasBySlug(client.id, cid) : null;
  const effectiveOrgId = await resolveOrgId();

  // Org isolation, as the canvas page: a foreign canvas reads as not found.
  if (!client || !canvas || client.org_id !== effectiveOrgId) {
    return <EditorEmpty message="Canvas not found" backHref="/" backLabel="← All clients" />;
  }

  const state = await loadEditorState(canvas.id);
  if (!state) {
    return (
      <EditorEmpty
        message="This canvas has no Editor yet. Add one on the canvas, connect clips to it, then open it."
        backHref={canvasPath}
        backLabel="← Back to canvas"
      />
    );
  }

  // The Editor's own title when it has one ("Reel 2"), else the canvas's name.
  const reelName = state.editorTitle === "Editor" ? canvas.name : state.editorTitle;
  return (
    <EditorShell
      canvasId={canvas.id}
      canvasPath={canvasPath}
      breadcrumb={`${client.name} / ${canvas.name}`}
      title={`${reelName} · rough cut`}
      initialState={state}
    />
  );
}
