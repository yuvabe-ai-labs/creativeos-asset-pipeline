import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  setActiveVersion: vi.fn(async () => undefined),
}));
vi.mock("@/lib/api/route-helpers", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/route-helpers")>("@/lib/api/route-helpers");
  return { ...actual, withNode: (_r: Request, _p: unknown, fn: (...a: unknown[]) => Promise<Response>) => fn("n1") };
});
vi.mock("@/lib/db/versions", () => ({ setActiveVersion: mocks.setActiveVersion }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: () => ({
    from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ single: async () => ({ data: mocks.row, error: null }) }) }) }) }),
  }),
}));

import { POST } from "./route";

const EDIT = {
  baseVersionId: "v3", rootVersionId: "v1", instruction: "make it beige", editPrompt: "make it beige",
  referenceNodeIds: [], referenceUrls: [], resolution: "720p",
};
const post = () =>
  POST(new Request("http://x/api/nodes/n1/restore-version", { method: "POST", body: JSON.stringify({ versionId: "v4" }) }), {
    params: Promise.resolve({ id: "n1" }),
  });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/nodes/[id]/restore-version", () => {
  it("returns the model and params of an ordinary version", async () => {
    mocks.row = { id: "v2", output: "o", model_used: "m", params_used: { a: 1 }, inputs_used: {} };
    expect(await (await post()).json()).toEqual({ output: "o", modelUsed: "m", paramsUsed: { a: 1 } });
  });

  it("flags an edited version so the node keeps its own model and settings", async () => {
    mocks.row = { id: "v4", output: "o", model_used: "gemini:omni", params_used: { resolution: "720p" }, inputs_used: { videoEdit: EDIT } };
    const json = await (await post()).json();
    expect(json).toMatchObject({ output: "o", edited: true });
    expect(mocks.setActiveVersion).toHaveBeenCalledWith("n1", "v4");
  });
});
