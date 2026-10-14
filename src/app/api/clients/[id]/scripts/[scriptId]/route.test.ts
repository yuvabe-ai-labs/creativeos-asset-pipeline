import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeAvatar } from "@/lib/avatars/__tests__/fixtures";
import { scriptDocSchema, type Script } from "@/lib/scripts/schema";
import reel01 from "@/lib/scripts/fixtures/reel-01.json";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({ resolveCallerContext: vi.fn(), resolveOrgId: vi.fn() }));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn() }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
vi.mock("@/lib/db/scripts", () => ({ listScripts: vi.fn(), getScript: vi.fn() }));
vi.mock("@/lib/db/avatars", () => ({ getAvatar: vi.fn() }));

import { resolveCallerContext, resolveOrgId } from "@/lib/dal";
import { resolveImpersonationState } from "@/lib/auth/impersonation";
import { getClientById } from "@/lib/db/clients";
import { getScript } from "@/lib/db/scripts";
import { getAvatar } from "@/lib/db/avatars";

const SCRIPT_ID = "6f1c2b1e-0000-4000-8000-000000000001";
const AVATAR_ID = "7a2d3c4e-0000-4000-8000-000000000002";
const params = Promise.resolve({ id: "c1", scriptId: SCRIPT_ID });
const req = () => new NextRequest(`http://localhost/api/clients/c1/scripts/${SCRIPT_ID}`);

function scriptWithLead(avatarId: string | null): Script {
  const doc = scriptDocSchema.parse(reel01);
  doc.cast = doc.cast.map((c) => (c.isLead ? { ...c, avatarId } : c));
  return { id: SCRIPT_ID, clientId: "c1", stage: "approved", doc, approvedAt: null, createdAt: "x", updatedAt: "x" };
}

describe("GET /api/clients/[id]/scripts/[scriptId]", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(resolveOrgId).mockResolvedValue("org-1");
    vi.mocked(resolveCallerContext).mockResolvedValue({ userId: "user-1", orgId: "org-1" } as never);
    vi.mocked(resolveImpersonationState).mockResolvedValue({ isImpersonating: false } as never);
    vi.mocked(getClientById).mockResolvedValue({ id: "c1", name: "Jackfruit365", org_id: "org-1" } as never);
  });

  it("returns the script and the lead's avatar when it is ready", async () => {
    vi.mocked(getScript).mockResolvedValue(scriptWithLead(AVATAR_ID));
    vi.mocked(getAvatar).mockResolvedValue(makeAvatar({ id: AVATAR_ID, status: "ready", archivedAt: null }));
    const { GET } = await import("./route");
    const res = await GET(req(), { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.script.id).toBe(SCRIPT_ID);
    expect(body.leadAvatarId).toBe(AVATAR_ID);
    expect(getScript).toHaveBeenCalledWith("c1", SCRIPT_ID);
    expect(getAvatar).toHaveBeenCalledWith("c1", AVATAR_ID);
  });

  it("gives no lead avatar when the lead has none yet", async () => {
    vi.mocked(getScript).mockResolvedValue(scriptWithLead(null));
    const { GET } = await import("./route");
    const body = await (await GET(req(), { params })).json();
    expect(body.leadAvatarId).toBeNull();
    expect(getAvatar).not.toHaveBeenCalled();
  });

  it("gives no lead avatar when that avatar was archived", async () => {
    vi.mocked(getScript).mockResolvedValue(scriptWithLead(AVATAR_ID));
    vi.mocked(getAvatar).mockResolvedValue(makeAvatar({ id: AVATAR_ID, archivedAt: "2026-10-09T00:00:00.000Z" }));
    const { GET } = await import("./route");
    expect((await (await GET(req(), { params })).json()).leadAvatarId).toBeNull();
  });

  it("gives no lead avatar when that avatar is a draft or gone", async () => {
    vi.mocked(getScript).mockResolvedValue(scriptWithLead(AVATAR_ID));
    vi.mocked(getAvatar).mockResolvedValue(makeAvatar({ id: AVATAR_ID, status: "draft" }));
    const { GET } = await import("./route");
    expect((await (await GET(req(), { params })).json()).leadAvatarId).toBeNull();
    vi.mocked(getAvatar).mockResolvedValue(null);
    expect((await (await GET(req(), { params })).json()).leadAvatarId).toBeNull();
  });

  it("is a 404 when the script is not this client's", async () => {
    vi.mocked(getScript).mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET(req(), { params });
    expect(res.status).toBe(404);
  });
});
