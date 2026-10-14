import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeAvatar } from "@/lib/avatars/__tests__/fixtures";
import { makeScript, SCRIPT_ID, MEENAKSHI_AVATAR } from "@/lib/scripts/visualise/__tests__/fixtures";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({ resolveCallerContext: vi.fn(), resolveOrgId: vi.fn() }));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn() }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
vi.mock("@/lib/db/avatars", () => ({ getAvatar: vi.fn() }));
vi.mock("@/lib/db/script-visualise", () => ({ setCastAvatar: vi.fn() }));

import { resolveOrgId } from "@/lib/dal";
import { resolveImpersonationState } from "@/lib/auth/impersonation";
import { getClientById } from "@/lib/db/clients";
import { getAvatar } from "@/lib/db/avatars";
import { setCastAvatar } from "@/lib/db/script-visualise";

const params = Promise.resolve({ id: "c1", scriptId: SCRIPT_ID, castId: "meenakshi" });
const put = (body: unknown) =>
  new NextRequest(`http://localhost/api/clients/c1/scripts/${SCRIPT_ID}/cast/meenakshi`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(resolveOrgId).mockResolvedValue("org-1");
  vi.mocked(resolveImpersonationState).mockResolvedValue({ isImpersonating: false } as never);
  vi.mocked(getClientById).mockResolvedValue({ id: "c1", name: "Jackfruit365", org_id: "org-1" } as never);
  vi.mocked(getAvatar).mockResolvedValue(makeAvatar({ id: MEENAKSHI_AVATAR }));
  vi.mocked(setCastAvatar).mockResolvedValue({ ok: true, script: makeScript() });
});

describe("PUT …/scripts/:scriptId/cast/:castId", () => {
  it("links this client's avatar to the cast member", async () => {
    const { PUT } = await import("./route");
    const res = await PUT(put({ avatarId: MEENAKSHI_AVATAR }), { params });
    expect(res.status).toBe(200);
    expect(getAvatar).toHaveBeenCalledWith("c1", MEENAKSHI_AVATAR);
    expect(setCastAvatar).toHaveBeenCalledWith("c1", SCRIPT_ID, "meenakshi", MEENAKSHI_AVATAR);
  });

  it("unlinks with null without looking up an avatar", async () => {
    const { PUT } = await import("./route");
    expect((await PUT(put({ avatarId: null }), { params })).status).toBe(200);
    expect(getAvatar).not.toHaveBeenCalled();
  });

  it("is a 404 for another client's avatar or an archived one", async () => {
    vi.mocked(getAvatar).mockResolvedValueOnce(null);
    const { PUT } = await import("./route");
    expect((await PUT(put({ avatarId: MEENAKSHI_AVATAR }), { params })).status).toBe(404);
    vi.mocked(getAvatar).mockResolvedValueOnce(makeAvatar({ archivedAt: "2026-10-08T00:00:00.000Z" }));
    expect((await PUT(put({ avatarId: MEENAKSHI_AVATAR }), { params })).status).toBe(404);
    expect(setCastAvatar).not.toHaveBeenCalled();
  });

  it("passes the write's refusal through with its status", async () => {
    vi.mocked(setCastAvatar).mockResolvedValue({ ok: false, error: "Meenakshi already has this avatar in this script.", status: 409 });
    const { PUT } = await import("./route");
    const res = await PUT(put({ avatarId: MEENAKSHI_AVATAR }), { params });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("Meenakshi already has this avatar in this script.");
  });

  it("is a 400 for a body that is not an avatar id", async () => {
    const { PUT } = await import("./route");
    expect((await PUT(put({ avatarId: "not-a-uuid" }), { params })).status).toBe(400);
  });
});
