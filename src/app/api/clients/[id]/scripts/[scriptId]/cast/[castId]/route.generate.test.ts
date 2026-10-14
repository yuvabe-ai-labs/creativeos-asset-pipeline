import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({ resolveCallerContext: vi.fn(), resolveOrgId: vi.fn() }));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn() }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
vi.mock("@/lib/db/script-generate", () => ({ changeGenerateScript: vi.fn(), loadGenerateState: vi.fn() }));
vi.mock("@/lib/db/avatars", () => ({ getAvatar: vi.fn() }));

import { changeGenerateScript, loadGenerateState } from "@/lib/db/script-generate";
import { getAvatar } from "@/lib/db/avatars";
import { makeAvatar } from "@/lib/avatars/__tests__/fixtures";
import { allowClient, AVATAR_ID, generateScript, jsonRequest, reel01Doc, runChangeAgainst, SCRIPT_ID, stateOf } from "@/lib/scripts/copilot/__tests__/route-mocks";

const params = Promise.resolve({ id: "c1", scriptId: SCRIPT_ID, castId: "husband" });
const link = (avatarId: unknown) => jsonRequest(`http://localhost/api/clients/c1/scripts/${SCRIPT_ID}/cast/husband`, "PATCH", { avatarId });

describe("PATCH .../cast/:castId", () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    await allowClient();
    vi.mocked(changeGenerateScript).mockImplementation(runChangeAgainst(generateScript({ doc: reel01Doc() })) as never);
    vi.mocked(loadGenerateState).mockResolvedValue(stateOf(generateScript()));
  });

  it("links a saved avatar of this client", async () => {
    vi.mocked(getAvatar).mockResolvedValue(makeAvatar({ id: AVATAR_ID, status: "ready", archivedAt: null }));
    const { PATCH } = await import("./route");
    expect((await PATCH(link(AVATAR_ID) as never, { params })).status).toBe(200);
    expect(getAvatar).toHaveBeenCalledWith("c1", AVATAR_ID);
  });

  it("unlinks to words only", async () => {
    const { PATCH } = await import("./route");
    expect((await PATCH(link(null) as never, { params })).status).toBe(200);
    expect(getAvatar).not.toHaveBeenCalled();
  });

  it("refuses a draft, archived or unknown avatar, and a malformed id", async () => {
    const { PATCH } = await import("./route");
    vi.mocked(getAvatar).mockResolvedValueOnce(makeAvatar({ id: AVATAR_ID, status: "draft", archivedAt: null }));
    expect((await PATCH(link(AVATAR_ID) as never, { params })).status).toBe(422);
    vi.mocked(getAvatar).mockResolvedValueOnce(null);
    expect((await PATCH(link(AVATAR_ID) as never, { params })).status).toBe(422);
    expect((await PATCH(link("not-a-uuid") as never, { params })).status).toBe(400);
  });
});
