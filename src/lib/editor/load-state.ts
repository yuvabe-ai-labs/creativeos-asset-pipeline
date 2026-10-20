// Everything the editor shows, in one server read (spec §10's call budget): the canvas's nodes
// and edges, the saved edit, then the Editor's inputs and their media facts, reconciled.
import "server-only";
import { listEdges, listIncomingEdges } from "@/lib/db/edges";
import { getEditorEdit } from "@/lib/db/editor-edits";
import { listNodes } from "@/lib/db/nodes";
import { nodeRowToFlow } from "@/lib/canvas-nodes";
import { describeNode } from "@/lib/nodes/describe-node";
import { ensureMediaFacts } from "./media-facts";
import { reconcile } from "./reconcile";
import type { EditorGraphNode } from "./shot-order";
import { attachFacts, sourceDrafts } from "./sources";
import { EditDocSchema, type EditDoc, type EditorState } from "./types";

/** The saved edit failed validation. Never treated as "no edit": that would overwrite it. */
export class EditUnreadableError extends Error {
  constructor() {
    super("The saved edit couldn't be read.");
    this.name = "EditUnreadableError";
  }
}

export async function loadEditorState(canvasId: string): Promise<EditorState | null> {
  const [rows, edges, stored] = await Promise.all([listNodes(canvasId), listEdges(canvasId), getEditorEdit(canvasId)]);
  const nodes = rows.map((r) => nodeRowToFlow(r) as unknown as EditorGraphNode);
  const editor = nodes.find((n) => n.type === "editor");
  if (!editor) return null;

  let prev: EditDoc | null = null;
  if (stored && stored.nodeId === editor.id) {
    const parsed = EditDocSchema.safeParse(stored.doc);
    if (!parsed.success) throw new EditUnreadableError();
    prev = parsed.data;
  }

  const activeVersion = new Map(rows.map((r) => [r.id, r.active_version_id]));
  const incoming = await listIncomingEdges(editor.id);
  const { drafts, notices: draftNotices } = sourceDrafts({
    incoming,
    nodes,
    edges,
    activeVersionOf: (id) => activeVersion.get(id) ?? null,
  });
  const urls = drafts.flatMap((d) => [d.urls.original, d.urls.lipSynced, d.urls.dubAudio]).filter((u): u is string => !!u);
  const sources = attachFacts(drafts, await ensureMediaFacts(urls));
  const connected = new Map(incoming.map((e) => [e.sourceNodeId, e.id]));
  const { doc, notices } = reconcile(prev, sources, () => crypto.randomUUID(), connected);

  return {
    canvasId,
    editorNodeId: editor.id,
    editorTitle: describeNode(editor),
    doc,
    changed: doc !== prev,
    notices: [...draftNotices, ...notices],
    sources,
  };
}
