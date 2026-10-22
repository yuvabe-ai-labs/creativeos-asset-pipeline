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
vi.mock("@/lib/db/nodes", () => ({ getNodeTypeOnCanvas: vi.fn() }));
vi.mock("@/lib/db/edges", () => ({ listIncomingEdges: vi.fn() }));
vi.mock("@/lib/db/generations", () => ({ listLatestGenerations: vi.fn() }));

import { listIncomingEdges } from "@/lib/db/edges";
import { listLatestGenerations } from "@/lib/db/generations";
import { getNodeTypeOnCanvas } from "@/lib/db/nodes";
import { GET } from "./route";

const ED = "11111111-1111-4111-8111-111111111111";
const get = (q: string) => GET(new Request(`http://x/api?${q}`), { params: Promise.resolve({ cid: "cv1" }) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getNodeTypeOnCanvas).mockResolvedValue("editor");
  vi.mocked(listIncomingEdges).mockResolvedValue([{ id: "e1", sourceNodeId: "dub1", createdAt: "x" }, { id: "e2", sourceNodeId: "vg1", createdAt: "y" }]);
  vi.mocked(listLatestGenerations).mockResolvedValue([{ node_id: "dub1", type: "dub", status: "running", error: null, created_at: "z" }]);
});

describe("GET /api/canvases/[cid]/editor/dub-status (D406)", () => {
  it("reports the latest dub or lip sync of each clip feeding this Editor", async () => {
    const res = await get(`nodeId=${ED}`);
    expect(listLatestGenerations).toHaveBeenCalledWith(["dub1", "vg1"], ["dub", "lipsync"]);
    expect(await res.json()).toEqual({ jobs: [{ nodeId: "dub1", kind: "dub", status: "running", error: null }] });
  });

  it("404s for a node that isn't this canvas's Editor", async () => {
    vi.mocked(getNodeTypeOnCanvas).mockResolvedValue("video-gen");
    expect((await get(`nodeId=${ED}`)).status).toBe(404);
    expect((await get("nodeId=nope")).status).toBe(400);
  });
});
