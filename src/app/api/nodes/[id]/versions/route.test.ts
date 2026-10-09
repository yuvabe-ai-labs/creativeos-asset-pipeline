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

// A node the client just added exists only in its store until autosave persists it, and the
// focus view reads its versions as it opens — so the row can be missing. `exists` toggles that.
const { nodeRow } = vi.hoisted(() => ({ nodeRow: { exists: true } }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(() => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: !nodeRow.exists ? null : {
              id: "node-1",
              canvas_id: "canvas-1",
              type: "image-gen",
              position: { x: 0, y: 0 },
              data: {},
              active_version_id: "v1",
              created_at: "",
              updated_at: "",
              canvases: { client_id: "client-1", clients: { org_id: "org-1" } },
            },
            error: null,
          }),
        }),
      }),
    }),
  })),
}));

const { db } = vi.hoisted(() => ({
  db: {
    listVersions: vi.fn(),
    getCreditsChargedByVersionIds: vi.fn(),
    getDecisionsByVersionIds: vi.fn(),
    getAnnotationsByDecisionIds: vi.fn(),
    resolveDisplayNames: vi.fn(),
  },
}));
vi.mock("@/lib/db/versions", () => ({ listVersions: db.listVersions }));
vi.mock("@/lib/db/generations", () => ({
  getCreditsChargedByVersionIds: db.getCreditsChargedByVersionIds,
}));
vi.mock("@/lib/db/decisions", () => ({ getDecisionsByVersionIds: db.getDecisionsByVersionIds }));
vi.mock("@/lib/db/annotations", () => ({
  getAnnotationsByDecisionIds: db.getAnnotationsByDecisionIds,
}));
vi.mock("@/lib/db/profiles", () => ({ resolveDisplayNames: db.resolveDisplayNames }));
vi.mock("@/lib/review-annotations/storage", () => ({
  annotationAssetUrls: () => new Map([["a1", "https://cdn/a1.png"]]),
}));

const version = {
  id: "v1",
  output: "https://cdn/v1.png",
  generated_output: null,
  error: null,
  model_used: "gpt-image-1",
  params_used: {},
  inputs_used: {},
  created_at: "2026-10-01T00:00:00Z",
  decision: null,
  note: null,
  approval_status: "changes_requested",
  operator_user_id: "maker-1",
  operator: null,
  approved_by_user_id: null,
  approved_at: null,
};
const decision = {
  id: "d1",
  version_id: "v1",
  status: "changes_requested",
  note: "Warmer light",
  decided_by_user_id: "senior-1",
  decided_at: "2026-10-02T00:00:00Z",
};
const annotation = {
  id: "a1",
  decision_id: "d1",
  seq: 1,
  kind: "region",
  timecode_ms: null,
  note: "here",
  bounds: null,
};

function get() {
  return import("./route").then(({ GET }) =>
    GET(new NextRequest("http://localhost/api/nodes/node-1/versions"), {
      params: Promise.resolve({ id: "node-1" }),
    }),
  );
}

describe("GET /api/nodes/[id]/versions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    nodeRow.exists = true;
    db.listVersions.mockResolvedValue([version]);
    db.getCreditsChargedByVersionIds.mockResolvedValue(new Map([["v1", 12]]));
    db.getDecisionsByVersionIds.mockResolvedValue(new Map([["v1", [decision]]]));
    db.getAnnotationsByDecisionIds.mockResolvedValue(new Map([["d1", [annotation]]]));
    db.resolveDisplayNames.mockResolvedValue(
      new Map([
        ["maker-1", "Maya"],
        ["senior-1", "Sam"],
      ]),
    );
  });

  it("joins credits, decisions, names and annotations onto each version", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.activeVersionId).toBe("v1");
    expect(json.versions[0]).toMatchObject({
      id: "v1",
      creditsCharged: 12,
      makerName: "Maya",
      approvalStatus: "changes_requested",
      decisions: [
        {
          id: "d1",
          reviewerName: "Sam",
          annotations: [{ id: "a1", seq: 1, maskUrl: "https://cdn/a1.png" }],
        },
      ],
    });
  });

  it("returns no versions (not a 404) for a node not yet persisted", async () => {
    nodeRow.exists = false;
    const res = await get();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ activeVersionId: null, versions: [] });
    expect(db.listVersions).not.toHaveBeenCalled();
  });

  it("reads credits and decisions side by side, then names and annotations side by side", async () => {
    // Hold the first lookup of each pair open: if the route awaited them one after the
    // other, its partner would not have been called yet.
    let releaseCredits!: () => void;
    db.getCreditsChargedByVersionIds.mockReturnValue(
      new Promise((r) => (releaseCredits = () => r(new Map([["v1", 12]])))),
    );
    let releaseNames!: () => void;
    db.resolveDisplayNames.mockReturnValue(
      new Promise((r) => (releaseNames = () => r(new Map()))),
    );

    const pending = get();
    await vi.waitFor(() => expect(db.getDecisionsByVersionIds).toHaveBeenCalled());
    releaseCredits();
    await vi.waitFor(() => expect(db.getAnnotationsByDecisionIds).toHaveBeenCalledWith(["d1"]));
    releaseNames();
    expect((await pending).status).toBe(200);
  });
});
