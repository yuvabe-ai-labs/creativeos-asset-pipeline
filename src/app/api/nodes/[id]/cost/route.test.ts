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

// YUV-273: a freshly-added node is only in client state until the 600ms autosave
// debounce flushes it — but useNodeCost fires its mount-time fetch immediately, so
// the /cost request routinely lands before the node row exists. `data: null` here
// simulates exactly that race.
let nodeExists = true;
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(() => ({
    from: (table: string) => {
      if (table === "nodes") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: nodeExists
                  ? {
                      id: "node-1",
                      canvas_id: "canvas-1",
                      type: "image-gen",
                      position: { x: 0, y: 0 },
                      data: {},
                      active_version_id: null,
                      created_at: "",
                      updated_at: "",
                      canvases: { client_id: "client-1", clients: { org_id: "org-1" } },
                    }
                  : null,
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "generations") {
        return {
          select: () => ({
            in: () => ({
              eq: async () => ({ data: [{ credits_charged: 5 }], error: null }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table in mock: ${table}`);
    },
  })),
}));

describe("GET /api/nodes/[id]/cost", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    nodeExists = true;
  });

  function makeRequest() {
    return new NextRequest("http://localhost/api/nodes/node-1/cost");
  }

  it("returns the summed credits for an existing node", async () => {
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "node-1" }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.totalCredits).toBe(5);
  });

  it("returns zero credits (not a 404) for a node not yet persisted", async () => {
    nodeExists = false;
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "node-1" }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.totalCredits).toBe(0);
  });
});
