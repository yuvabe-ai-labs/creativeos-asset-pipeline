import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({ resolveCallerContext: vi.fn(), resolveOrgId: vi.fn() }));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn() }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
vi.mock("@/lib/db/script-generate", () => ({
  changeGenerateScript: vi.fn(), listScriptMessages: vi.fn(), setMessageCard: vi.fn(), insertScriptMessages: vi.fn(),
  loadGenerateState: vi.fn(), getGenerateScript: vi.fn(), listCopilotAvatars: vi.fn(), claimProposalCard: vi.fn(),
}));

import {
  changeGenerateScript, claimProposalCard, getGenerateScript, insertScriptMessages, listCopilotAvatars, listScriptMessages, loadGenerateState, setMessageCard,
} from "@/lib/db/script-generate";
import { allowClient, generateScript, jsonRequest, reel01Doc, runChangeAgainst, SCRIPT_ID, stateOf } from "@/lib/scripts/copilot/__tests__/route-mocks";
import type { ProposalCard } from "@/lib/scripts/copilot/schema";

const MSG = "8b3e4d5f-0000-4000-8000-000000000003";
const params = Promise.resolve({ id: "c1", scriptId: SCRIPT_ID, messageId: MSG });
const decide = (decision: string) => jsonRequest(`http://localhost/api/clients/c1/scripts/${SCRIPT_ID}/proposals/${MSG}`, "POST", { decision });
const card: ProposalCard = {
  kind: "proposal", status: "pending", summary: "Removed S2.", before: [], after: [],
  ops: [{ op: "remove_shot", path: null, value: null, shotId: "s02", afterShotId: null, shot: null, second: null, list: null, cast: null, itemId: null }],
};

describe("POST .../proposals/:messageId", () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    await allowClient();
    vi.mocked(listCopilotAvatars).mockResolvedValue([]);
    vi.mocked(claimProposalCard).mockResolvedValue(true);
    vi.mocked(listScriptMessages).mockResolvedValue([{ id: MSG, role: "assistant", content: "x", card, createdAt: "t" }]);
    vi.mocked(getGenerateScript).mockResolvedValue(generateScript({ doc: reel01Doc() }));
    vi.mocked(loadGenerateState).mockResolvedValue(stateOf(generateScript()));
  });

  it("accepting applies the operations to the current script and marks the card accepted", async () => {
    vi.mocked(changeGenerateScript).mockImplementation(runChangeAgainst(generateScript({ doc: reel01Doc() })) as never);
    const { POST } = await import("./route");
    expect((await POST(decide("accept") as never, { params })).status).toBe(200);
    expect(vi.mocked(claimProposalCard).mock.calls[0][3]).toMatchObject({ status: "accepted" });
    expect(setMessageCard).not.toHaveBeenCalled();
  });

  it("accepting after the targeted shot was deleted applies nothing and marks the card out of date", async () => {
    const gone = reel01Doc();
    gone.shots = gone.shots.filter((s) => s.id !== "s02");
    vi.mocked(changeGenerateScript).mockImplementation(runChangeAgainst(generateScript({ doc: gone })) as never);
    const { POST } = await import("./route");
    await POST(decide("accept") as never, { params });
    expect(vi.mocked(setMessageCard).mock.calls[0][3]).toMatchObject({ status: "stale" });
    expect(vi.mocked(insertScriptMessages).mock.calls[0][3][0].content).toMatch(/nothing was applied/);
  });

  it("rejecting leaves the script alone", async () => {
    const { POST } = await import("./route");
    await POST(decide("reject") as never, { params });
    expect(changeGenerateScript).not.toHaveBeenCalled();
    expect(vi.mocked(claimProposalCard).mock.calls[0][3]).toMatchObject({ status: "rejected" });
  });

  it("a second accept that loses the claim applies nothing (final review 2)", async () => {
    vi.mocked(claimProposalCard).mockResolvedValue(false);
    const { POST } = await import("./route");
    const res = await POST(decide("accept") as never, { params });
    expect(res.status).toBe(409);
    expect(changeGenerateScript).not.toHaveBeenCalled();
  });

  it("puts the card back to pending when the script cannot be changed, so it can be tried again", async () => {
    vi.mocked(changeGenerateScript).mockResolvedValue({ error: "This script is final. Reopen it from Visualise to change it.", status: 409 } as never);
    const { POST } = await import("./route");
    expect((await POST(decide("accept") as never, { params })).status).toBe(409);
    expect(vi.mocked(setMessageCard).mock.calls[0][3]).toMatchObject({ status: "pending" });
  });

  it("is a 404 for a message with no proposal, and a 400 for an unknown decision", async () => {
    const { POST } = await import("./route");
    expect((await POST(decide("maybe") as never, { params })).status).toBe(400);
    vi.mocked(listScriptMessages).mockResolvedValue([]);
    expect((await POST(decide("accept") as never, { params })).status).toBe(404);
  });
});
