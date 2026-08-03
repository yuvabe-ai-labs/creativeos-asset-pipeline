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
}));

// Regression coverage for the video-prompt "image renders as raw URL text" bug:
// this route must dispatch to resolveVideoPromptInputs for video-prompt nodes and
// resolvePromptInputs for everything else — mocking Supabase per node type lets us
// pin that dispatch without a real DB.
let nodeType = "prompt";
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(() => ({
    from: (table: string) => {
      if (table === "nodes") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: "node-1",
                  canvas_id: "canvas-1",
                  type: nodeType,
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

vi.mock("@/lib/nodes/resolve-inputs", () => ({
  resolvePromptInputs: vi.fn(async () => ({
    clientContext: "",
    kbVersionId: null,
    slices: [],
    upstream: [{ nodeId: "up-1", versionId: null, label: "Image", type: "image-gen", text: "via-prompt-resolver" }],
  })),
  resolveVideoPromptInputs: vi.fn(async () => ({
    clientContext: "",
    kbVersionId: null,
    slices: [],
    upstream: [
      {
        nodeId: "up-1",
        versionId: null,
        label: "Image",
        type: "image-gen",
        text: "",
        fileUrl: "https://example.com/still.jpg",
        fileKind: "image",
      },
    ],
  })),
}));

import { resolvePromptInputs, resolveVideoPromptInputs } from "@/lib/nodes/resolve-inputs";

describe("POST /api/nodes/[id]/compile-preview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    nodeType = "prompt";
  });

  function makeRequest() {
    return new NextRequest("http://localhost/api/nodes/node-1/compile-preview", {
      method: "POST",
      body: JSON.stringify({ slices: [] }),
    });
  }

  it("uses resolvePromptInputs for a prompt node", async () => {
    nodeType = "prompt";
    const { POST } = await import("./route");
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: "node-1" }) });
    const json = await res.json();

    expect(resolvePromptInputs).toHaveBeenCalledWith("node-1", []);
    expect(resolveVideoPromptInputs).not.toHaveBeenCalled();
    expect(json.connected[0].fileUrl).toBeUndefined();
  });

  it("uses resolveVideoPromptInputs for a video-prompt node, preserving the image-gen fileUrl", async () => {
    nodeType = "video-prompt";
    const { POST } = await import("./route");
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: "node-1" }) });
    const json = await res.json();

    expect(resolveVideoPromptInputs).toHaveBeenCalledWith("node-1", []);
    expect(resolvePromptInputs).not.toHaveBeenCalled();
    expect(json.connected[0].fileUrl).toBe("https://example.com/still.jpg");
    expect(json.connected[0].fileKind).toBe("image");
  });
});
