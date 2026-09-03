import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/dal", () => ({
  resolveCallerContext: vi.fn(async () => ({
    userId: "user-1",
    platformRole: "member",
    orgId: "org-1",
    orgRole: "owner",
    mustChangePassword: false,
  })),
  resolveOrgId: vi.fn(async () => "org-1"),
}));
vi.mock("@/lib/auth/impersonation", () => ({
  resolveImpersonationState: vi.fn(async () => ({ isImpersonating: false })),
}));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn(async () => undefined) }));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(() => ({
    from: (table: string) => {
      if (table === "nodes") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: "vg",
                  canvas_id: "canvas-1",
                  type: "video-gen",
                  position: { x: 0, y: 0 },
                  data: {},
                  active_version_id: null,
                  created_at: "",
                  updated_at: "",
                  canvases: { client_id: "client-1", clients: { org_id: "org-1" } },
                },
                error: null,
              }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table in mock: ${table}`);
    },
  })),
}));

// The upstream graph under test: video-gen "vg" <- multishot-prompt "mp" <- { image-gen "ig"
// (a reference image the plan's <IMAGE_REF_N> tokens point at), multishot "ms" (the cut list) }.
// This is the exact shape a real canvas produces when an Image Gen still feeds a Multishot
// Prompt node as a reference (a valid connection per VALID_CONNECTIONS in canvas-nodes.ts).
type Row = {
  nodeId: string;
  type: string;
  data: Record<string, unknown>;
  activeOutput: unknown;
  versionId: string | null;
};
const GRAPH: Record<string, Row[]> = {
  vg: [
    {
      nodeId: "mp",
      type: "multishot-prompt",
      data: {},
      activeOutput: { version: 1, look: "moody", beats: [{ cutId: "c1", text: "hello <IMAGE_REF_0>" }] },
      versionId: "v1",
    },
  ],
  mp: [
    { nodeId: "ig", type: "image-gen", data: {}, activeOutput: "https://img.example/ref.png", versionId: "v2" },
    {
      nodeId: "ms",
      type: "multishot",
      data: { cuts: [{ id: "c1", text: "a cut", seconds: 3 }] },
      activeOutput: null,
      versionId: null,
    },
  ],
};

vi.mock("@/lib/db/nodes", () => ({
  getUpstreamOutputs: vi.fn(async (nodeId: string) => GRAPH[nodeId] ?? []),
}));

describe("GET /api/nodes/[id]/upstream-images", () => {
  beforeEach(() => vi.clearAllMocks());

  function makeRequest() {
    return new NextRequest("http://localhost/api/nodes/vg/upstream-images");
  }

  // Regression: image-gen nodes were excluded whenever they arrived via the grandparent
  // (prompt-node) path — a rule that is correct for video-prompt (whose image-gen upstream is
  // vision context for the motion-prompt WRITER and is never itself uploaded) but was wrongly
  // applied to multishot-prompt too, whose <IMAGE_REF_N> tokens are numbered over exactly that
  // upstream. Excluding it left a token in the rendered plan with no matching image — the focus
  // view under-reported "Connected", and the same exclusion in video-generate/route.ts meant the
  // reference was never actually sent to the video model.
  it("surfaces an image-gen reference connected to a multishot-prompt node", async () => {
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "vg" }) });
    const json = await res.json();

    expect(json.images).toHaveLength(1);
    expect(json.images[0]).toMatchObject({
      id: "ig",
      type: "image-gen",
      imageUrl: "https://img.example/ref.png",
    });
    expect(json.promptNode).toMatchObject({ id: "mp", type: "multishot-prompt" });
    expect(json.promptNode.text).toContain("hello <IMAGE_REF_0>");
  });
});
