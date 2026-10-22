import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({ resolveOrgId: vi.fn(async () => "org-1"), resolveCallerContext: vi.fn() }));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn(async () => ({ isImpersonating: false })) }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: "cv1", client_id: "cl1", clients: { org_id: "org-1" } }, error: null }) }) }) }),
  }),
}));
vi.mock("@/lib/db/canvas-lock", () => ({ getCanvasLockHolder: vi.fn() }));
vi.mock("@/lib/db/edges", () => ({ listIncomingEdges: vi.fn() }));
vi.mock("@/lib/db/editor-edits", () => ({ getEditorEdit: vi.fn(), saveEditorEdit: vi.fn() }));
vi.mock("@/lib/db/canvas-graph", () => ({ getCanvasNode: vi.fn(), insertCanvasNode: vi.fn(), insertCanvasEdges: vi.fn(), deleteCanvasEdge: vi.fn() }));
vi.mock("@/lib/editor/load-state", () => ({ loadEditorState: vi.fn(async () => ({ editorNodeId: "ed" })) }));

import { getCanvasLockHolder } from "@/lib/db/canvas-lock";
import { deleteCanvasEdge, getCanvasNode, insertCanvasEdges, insertCanvasNode } from "@/lib/db/canvas-graph";
import { listIncomingEdges } from "@/lib/db/edges";
import { getEditorEdit, saveEditorEdit } from "@/lib/db/editor-edits";
import { DEFAULT_CAPTION_STYLE } from "@/lib/editor/caption-style";
import { POST } from "./route";

const ED = "11111111-1111-4111-8111-111111111111";
const VG = "22222222-2222-4222-8222-222222222222";
const post = (body: unknown) => POST(new Request("http://x", { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ cid: "cv1" }) });
const doc = {
  v: 2, shape: "9:16", captionStyle: DEFAULT_CAPTION_STYLE, captions: [],
  sources: [{ nodeId: VG, edgeId: "e-vg", versionId: "v1" }],
  pieces: [{ id: "p1", sourceNodeId: VG, in: 0, out: 4, picture: "original", sound: "original" }],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCanvasLockHolder).mockResolvedValue("sess");
  vi.mocked(getCanvasNode).mockImplementation(async (_c, id) => (id === ED ? { id: ED, type: "editor", position: { x: 900, y: 0 }, data: {} } : id === VG ? { id: VG, type: "video-gen", position: { x: 100, y: 50 }, data: {} } : null));
  vi.mocked(listIncomingEdges).mockResolvedValue([{ id: "e-vg", sourceNodeId: VG, createdAt: "x" }]);
  vi.mocked(getEditorEdit).mockResolvedValue({ nodeId: ED, doc });
});

describe("POST /api/canvases/[cid]/editor/dub-source (D406)", () => {
  it("puts a Dubbing node between the clip and the Editor, and moves the clip's pieces to it", async () => {
    const res = await post({ nodeId: ED, sessionId: "sess", sourceNodeId: VG });
    expect(res.status).toBe(200);
    const node = vi.mocked(insertCanvasNode).mock.calls[0][1];
    expect(node).toMatchObject({ type: "dubbing", position: { x: 460, y: 50 } });
    const edges = vi.mocked(insertCanvasEdges).mock.calls[0][1];
    expect(edges.map((e) => [e.source, e.target])).toEqual([[VG, node.id], [node.id, ED]]);
    expect(deleteCanvasEdge).toHaveBeenCalledWith("cv1", "e-vg");
    const saved = vi.mocked(saveEditorEdit).mock.calls[0][0].doc;
    expect(saved.pieces[0].sourceNodeId).toBe(node.id);
    expect(saved.sources[0]).toEqual({ nodeId: node.id, edgeId: edges[1].id, versionId: "input:v1" });
    expect((await res.json()).dubbingNodeId).toBe(node.id);
  });

  it("refuses unless this tab holds the canvas lock", async () => {
    vi.mocked(getCanvasLockHolder).mockResolvedValue("someone-else");
    expect((await post({ nodeId: ED, sessionId: "sess", sourceNodeId: VG })).status).toBe(409);
    expect(insertCanvasNode).not.toHaveBeenCalled();
  });

  it("refuses a clip that isn't a Video Gen feeding this Editor", async () => {
    vi.mocked(listIncomingEdges).mockResolvedValue([]);
    expect((await post({ nodeId: ED, sessionId: "sess", sourceNodeId: VG })).status).toBe(404);
    vi.mocked(getCanvasNode).mockResolvedValue(null);
    expect((await post({ nodeId: ED, sessionId: "sess", sourceNodeId: VG })).status).toBe(404);
  });
});
