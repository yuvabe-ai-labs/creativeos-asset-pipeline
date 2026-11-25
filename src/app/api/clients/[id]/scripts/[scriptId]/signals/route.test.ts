import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({ resolveCallerContext: vi.fn(), resolveOrgId: vi.fn() }));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn() }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
vi.mock("@/lib/db/signals", () => ({ listSignalNames: vi.fn() }));
vi.mock("@/lib/db/script-generate", () => ({
  getGenerateScript: vi.fn(), changeGenerateScript: vi.fn(), changeVisualiseScript: vi.fn(),
  insertScriptMessages: vi.fn(), loadGenerateState: vi.fn(),
}));

import { resolveCallerContext, resolveOrgId } from "@/lib/dal";
import { resolveImpersonationState } from "@/lib/auth/impersonation";
import { getClientById } from "@/lib/db/clients";
import { listSignalNames } from "@/lib/db/signals";
import { changeGenerateScript, changeVisualiseScript, getGenerateScript, insertScriptMessages, loadGenerateState } from "@/lib/db/script-generate";
import { EMPTY_BRIEF, EMPTY_NOTES, type GenerateScript } from "@/lib/scripts/copilot/schema";
import { scriptDocSchema } from "@/lib/scripts/schema";
import reel01 from "@/lib/scripts/fixtures/reel-01.json";

// D531: the person sets a script's "Built from" on its line. Only the client's own signals; only
// while the script is being written or drawn; after the draft it offers a rewrite and changes no shot.

const SID = "0b7d7a0e-6a4f-4c0e-9a55-1f1f8f3a2c33";
const doc = scriptDocSchema.parse(reel01);
const script = (over: Partial<GenerateScript> = {}): GenerateScript => ({
  id: SID, clientId: "c1", stage: "generate", doc: null, brief: EMPTY_BRIEF, notes: EMPTY_NOTES, docVersion: 3, createdAt: "", updatedAt: "", ...over,
});
const params = Promise.resolve({ id: "c1", scriptId: SID });
const put = async (body: unknown) => {
  const { PUT } = await import("./route");
  return PUT(new NextRequest(`http://localhost/api/clients/c1/scripts/${SID}/signals`, { method: "PUT", body: JSON.stringify(body) }), { params });
};
/** Runs the change against `current` and returns what the route wrote. */
const runChange = (current: GenerateScript) => async (_c: string, _s: string, change: (s: GenerateScript) => unknown) => {
  const out = change(current) as { patch: unknown; result: unknown };
  written = out.patch;
  return { script: current, result: out.result } as never;
};
let written: unknown = undefined;

describe("PUT /api/clients/:id/scripts/:scriptId/signals", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    written = undefined;
    vi.mocked(resolveOrgId).mockResolvedValue("o1");
    vi.mocked(resolveCallerContext).mockResolvedValue({ userId: "u1", orgId: "o1" } as never);
    vi.mocked(resolveImpersonationState).mockResolvedValue({ isImpersonating: false } as never);
    vi.mocked(getClientById).mockResolvedValue({ id: "c1", slug: "acme", org_id: "o1" } as never);
    vi.mocked(listSignalNames).mockResolvedValue([{ id: "s1", name: "Monsoon rituals" }, { id: "s2", name: "Office dry skin" }]);
    vi.mocked(getGenerateScript).mockResolvedValue(script());
    vi.mocked(changeGenerateScript).mockImplementation(runChange(script()));
    vi.mocked(loadGenerateState).mockResolvedValue({ script: script() } as never);
  });

  it("sets Built from before the draft, and offers nothing", async () => {
    const res = await put({ signalIds: ["s2", "s2"] });
    expect(res.status).toBe(200);
    expect(written).toEqual({ brief: { ...EMPTY_BRIEF, signalIds: ["s2"] } });
    expect(insertScriptMessages).not.toHaveBeenCalled();
  });

  it("rejects a signal that is not the client's", async () => {
    expect((await put({ signalIds: ["s1", "foreign"] })).status).toBe(400);
    expect(changeGenerateScript).not.toHaveBeenCalled();
  });

  it("rejects a script in review or approved", async () => {
    vi.mocked(getGenerateScript).mockResolvedValue(script({ doc, stage: "in_review" }));
    expect((await put({ signalIds: ["s1"] })).status).toBe(409);
  });

  it("after the draft posts the rewrite offer and changes no shot", async () => {
    vi.mocked(getGenerateScript).mockResolvedValue(script({ doc }));
    vi.mocked(changeGenerateScript).mockImplementation(runChange(script({ doc })));
    expect((await put({ signalIds: ["s1"] })).status).toBe(200);
    expect(written).toEqual({ brief: { ...EMPTY_BRIEF, signalIds: ["s1"] } });
    expect(insertScriptMessages).toHaveBeenCalledWith("c1", SID, "u1", [{
      role: "assistant", content: "Built from changed. Want me to rewrite the script with these signals?", card: null,
      suggestions: ["Rewrite with these signals"],
    }]);
  });

  it("writes nothing and offers nothing when the set did not change", async () => {
    const same = script({ doc, brief: { ...EMPTY_BRIEF, signalIds: ["s1"] } });
    vi.mocked(getGenerateScript).mockResolvedValue(same);
    vi.mocked(changeGenerateScript).mockImplementation(runChange(same));
    await put({ signalIds: ["s1"] });
    expect(written).toBeNull();
    expect(insertScriptMessages).not.toHaveBeenCalled();
  });

  it("writes through the Visualise guard at Visualise", async () => {
    vi.mocked(getGenerateScript).mockResolvedValue(script({ doc, stage: "visualise" }));
    vi.mocked(changeVisualiseScript).mockImplementation(runChange(script({ doc, stage: "visualise" })));
    await put({ signalIds: ["s1"] });
    expect(changeVisualiseScript).toHaveBeenCalled();
    expect(changeGenerateScript).not.toHaveBeenCalled();
  });
});
