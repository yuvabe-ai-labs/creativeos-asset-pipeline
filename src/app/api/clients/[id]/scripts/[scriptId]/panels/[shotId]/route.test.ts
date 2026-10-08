import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { faceKey } from "@/lib/scripts/visualise/keys";
import {
  HUSBAND_AVATAR, makeScript, makeTake, MEENAKSHI_AVATAR, readyAvatar, reel01Doc, SCRIPT_ID,
} from "@/lib/scripts/visualise/__tests__/fixtures";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({ resolveCallerContext: vi.fn(), resolveOrgId: vi.fn() }));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn() }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
vi.mock("@/lib/db/scripts", () => ({ getScript: vi.fn() }));
vi.mock("@/lib/scripts/visualise/board-server", () => ({ loadVisualiseBoard: vi.fn() }));
vi.mock("@/lib/scripts/visualise/run-panel", () => ({ runPanelGeneration: vi.fn() }));
vi.mock("@/lib/db/script-panels", () => ({
  insertPanelTake: vi.fn(), succeedPanelTake: vi.fn(), failPanelTake: vi.fn(), setPanelPick: vi.fn(),
}));
vi.mock("@/lib/db/credit-transactions", () => {
  class CreditLimitError extends Error {}
  return { CreditLimitError };
});

import { resolveCallerContext, resolveOrgId } from "@/lib/dal";
import { resolveImpersonationState } from "@/lib/auth/impersonation";
import { getClientById } from "@/lib/db/clients";
import { getScript } from "@/lib/db/scripts";
import { loadVisualiseBoard } from "@/lib/scripts/visualise/board-server";
import { runPanelGeneration } from "@/lib/scripts/visualise/run-panel";
import { failPanelTake, insertPanelTake, setPanelPick, succeedPanelTake } from "@/lib/db/script-panels";
import { CreditLimitError } from "@/lib/db/credit-transactions";

const meenakshi = readyAvatar(MEENAKSHI_AVATAR, "meenakshi");
const husband = readyAvatar(HUSBAND_AVATAR, "husband");
const ctx = (shotId: string) => ({ params: Promise.resolve({ id: "c1", scriptId: SCRIPT_ID, shotId }) });
const post = (body: unknown) =>
  new NextRequest(`http://localhost/api/clients/c1/scripts/${SCRIPT_ID}/panels/s06`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(resolveOrgId).mockResolvedValue("org-1");
  vi.mocked(resolveCallerContext).mockResolvedValue({ userId: "u1", email: "op@x.com", orgId: "org-1" } as never);
  vi.mocked(resolveImpersonationState).mockResolvedValue({ isImpersonating: false } as never);
  vi.mocked(getClientById).mockResolvedValue({ id: "c1", name: "Jackfruit365", org_id: "org-1" } as never);
  vi.mocked(getScript).mockResolvedValue(makeScript());
  vi.mocked(loadVisualiseBoard).mockResolvedValue({ avatars: [meenakshi, husband], takes: [], picks: {}, kits: [] });
  vi.mocked(insertPanelTake).mockImplementation(async (i) => makeTake({ id: "t-new", status: "running", url: null, ...i }));
  vi.mocked(runPanelGeneration).mockResolvedValue({
    generation: { id: "g1", output_snapshot: "https://x/p.png", meta: { width: 768, height: 1365 } } as never, creditsCharged: 9,
  });
  vi.mocked(succeedPanelTake).mockImplementation(async (id, r) => makeTake({ id, url: r.url }));
  vi.mocked(failPanelTake).mockResolvedValue(undefined);
  vi.mocked(setPanelPick).mockResolvedValue(undefined);
});

describe("POST …/panels/:shotId", () => {
  it("draws the panel from both people's views, stores the take and picks it", async () => {
    const { POST } = await import("./route");
    const res = await POST(post({ kind: "draw" }), ctx("s06"));
    expect(res.status).toBe(200);
    const take = vi.mocked(insertPanelTake).mock.calls[0][0];
    expect(take).toMatchObject({ clientId: "c1", scriptId: SCRIPT_ID, shotId: "s06", promptEdited: false, userId: "u1" });
    expect(take.prompt).toContain("marker-and-wash sketch");
    const run = vi.mocked(runPanelGeneration).mock.calls[0][0];
    expect(run).toMatchObject({ scriptId: SCRIPT_ID, shotId: "s06", aspect: "9:16", orgId: "org-1", prompt: take.prompt });
    expect(run.referenceUrls).toHaveLength(8);
    expect(succeedPanelTake).toHaveBeenCalledWith("t-new", { url: "https://x/p.png", width: 768, height: 1365, generationId: "g1" });
    expect(setPanelPick).toHaveBeenCalledWith(SCRIPT_ID, "s06", "t-new");
    expect((await res.json()).pickId).toBe("t-new");
  });

  it("records the faces it drew from BEFORE the model call, so a refine during the draw marks it out of date", async () => {
    const { POST } = await import("./route");
    await POST(post({ kind: "draw" }), ctx("s06"));
    const take = vi.mocked(insertPanelTake).mock.calls[0][0];
    expect(take.faces.meenakshi).toEqual({ avatarId: MEENAKSHI_AVATAR, faceKey: faceKey(meenakshi) });
    expect(vi.mocked(insertPanelTake).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(runPanelGeneration).mock.invocationCallOrder[0]);
  });

  it("refuses while someone on screen has no avatar with four views, and names them", async () => {
    vi.mocked(loadVisualiseBoard).mockResolvedValue({ avatars: [husband], takes: [], picks: {}, kits: [] });
    const { POST } = await import("./route");
    const res = await POST(post({ kind: "draw" }), ctx("s06"));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("Meenakshi needs an avatar with its four views first.");
    expect(insertPanelTake).not.toHaveBeenCalled();
  });

  it("draws a B-roll shot with no avatars at all", async () => {
    vi.mocked(getScript).mockResolvedValue(makeScript(reel01Doc()));
    vi.mocked(loadVisualiseBoard).mockResolvedValue({ avatars: [], takes: [], picks: {}, kits: [] });
    const { POST } = await import("./route");
    expect((await POST(post({ kind: "draw" }), ctx("s03"))).status).toBe(200);
    expect(vi.mocked(runPanelGeneration).mock.calls[0][0].referenceUrls).toEqual([]);
  });

  it("sends an edited prompt as written, and keeps it on a plain redraw while the shot is unchanged", async () => {
    const { POST } = await import("./route");
    await POST(post({ kind: "edited", prompt: "Closer on her hands." }), ctx("s06"));
    expect(vi.mocked(insertPanelTake).mock.calls[0][0]).toMatchObject({ prompt: "Closer on her hands.", promptEdited: true });

    const first = vi.mocked(insertPanelTake).mock.calls[0][0];
    const picked = makeTake({ id: "t-old", shotId: "s06", prompt: "Closer on her hands.", promptEdited: true, shotKey: first.shotKey });
    vi.mocked(loadVisualiseBoard).mockResolvedValue({ avatars: [meenakshi, husband], takes: [picked], picks: { s06: "t-old" }, kits: [] });
    await POST(post({ kind: "draw" }), ctx("s06"));
    expect(vi.mocked(insertPanelTake).mock.calls[1][0]).toMatchObject({ prompt: "Closer on her hands.", promptEdited: true });
  });

  it("is a 400 for an empty edited prompt or an unknown body", async () => {
    const { POST } = await import("./route");
    expect((await POST(post({ kind: "edited", prompt: "  " }), ctx("s06"))).status).toBe(400);
    expect((await POST(post({ kind: "paint" }), ctx("s06"))).status).toBe(400);
  });

  it("fails the take with the cap message and answers 402", async () => {
    vi.mocked(runPanelGeneration).mockRejectedValue(new CreditLimitError("Monthly credit limit reached"));
    const { POST } = await import("./route");
    const res = await POST(post({ kind: "draw" }), ctx("s06"));
    expect(res.status).toBe(402);
    expect(failPanelTake).toHaveBeenCalledWith("t-new", expect.stringContaining("Monthly credit limit"));
    expect(setPanelPick).not.toHaveBeenCalled();
  });

  it("fails the take with the provider's message and answers 502", async () => {
    vi.mocked(runPanelGeneration).mockRejectedValue(new Error("Content blocked"));
    const { POST } = await import("./route");
    const res = await POST(post({ kind: "draw" }), ctx("s06"));
    expect(res.status).toBe(502);
    expect(failPanelTake).toHaveBeenCalledWith("t-new", "Content blocked");
  });

  it("refuses outside Visualise and In review, and is a 404 for a shot the script does not have", async () => {
    vi.mocked(getScript).mockResolvedValueOnce(makeScript(undefined, "approved"));
    const { POST } = await import("./route");
    expect((await POST(post({ kind: "draw" }), ctx("s06"))).status).toBe(409);
    expect((await POST(post({ kind: "draw" }), ctx("s99"))).status).toBe(404);
  });
});
