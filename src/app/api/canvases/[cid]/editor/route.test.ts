import { DEFAULT_CAPTION_STYLE } from "@/lib/editor/caption-style";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({
  resolveCallerContext: vi.fn(async () => ({ userId: "u1", orgId: "org-1", orgRole: "owner" })),
  resolveOrgId: vi.fn(async () => "org-1"),
}));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn(async () => ({ isImpersonating: false })) }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: "cv1", clients: { org_id: "org-1" } }, error: null }) }) }) }),
  }),
}));
vi.mock("@/lib/editor/load-state", () => ({ loadEditorState: vi.fn(), EditUnreadableError: class extends Error {} }));
vi.mock("@/lib/db/canvas-lock", () => ({ getCanvasLockHolder: vi.fn() }));
vi.mock("@/lib/db/nodes", () => ({ getNodeTypeOnCanvas: vi.fn() }));
vi.mock("@/lib/db/editor-edits", () => ({ saveEditorEdit: vi.fn() }));

import { getCanvasLockHolder } from "@/lib/db/canvas-lock";
import { saveEditorEdit } from "@/lib/db/editor-edits";
import { getNodeTypeOnCanvas } from "@/lib/db/nodes";
import { loadEditorState } from "@/lib/editor/load-state";
import { GET, PATCH } from "./route";

const params = Promise.resolve({ cid: "cv1" });
const NODE = "11111111-1111-4111-8111-111111111111";
const doc = { v: 2, shape: "9:16", sources: [], pieces: [], captions: [], captionStyle: DEFAULT_CAPTION_STYLE };
const patch = (body: unknown) =>
  PATCH(new Request("http://x/api/canvases/cv1/editor", { method: "PATCH", body: JSON.stringify(body) }), { params });

beforeEach(() => {
  vi.mocked(getCanvasLockHolder).mockResolvedValue("s1");
  vi.mocked(getNodeTypeOnCanvas).mockResolvedValue("editor");
  vi.mocked(saveEditorEdit).mockReset();
});

describe("GET /api/canvases/[cid]/editor", () => {
  it("404s without an Editor", async () => {
    vi.mocked(loadEditorState).mockResolvedValue(null);
    const res = await GET(new Request("http://x"), { params });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "This canvas has no Editor yet." });
  });
});

describe("PATCH /api/canvases/[cid]/editor", () => {
  it("rejects an invalid doc", async () => {
    expect((await patch({ nodeId: NODE, sessionId: "s1", doc: { v: 3 } })).status).toBe(400);
  });

  it("404s for a node that isn't this canvas's Editor", async () => {
    vi.mocked(getNodeTypeOnCanvas).mockResolvedValue(null);
    expect((await patch({ nodeId: NODE, sessionId: "s1", doc })).status).toBe(404);
  });

  it("409s when another session holds the lock", async () => {
    vi.mocked(getCanvasLockHolder).mockResolvedValue("someone-else");
    const res = await patch({ nodeId: NODE, sessionId: "s1", doc });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "Someone else is editing this canvas now, so the editor is read-only." });
    expect(saveEditorEdit).not.toHaveBeenCalled();
  });

  it("saves under the lock", async () => {
    const res = await patch({ nodeId: NODE, sessionId: "s1", doc });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(saveEditorEdit).toHaveBeenCalledWith({ nodeId: NODE, canvasId: "cv1", doc });
  });
});
