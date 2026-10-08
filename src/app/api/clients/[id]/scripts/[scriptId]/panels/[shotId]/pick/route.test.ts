import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeScript, makeTake, SCRIPT_ID } from "@/lib/scripts/visualise/__tests__/fixtures";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({ resolveCallerContext: vi.fn(), resolveOrgId: vi.fn() }));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn() }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
vi.mock("@/lib/db/scripts", () => ({ getScript: vi.fn() }));
vi.mock("@/lib/db/script-panels", () => ({ getPanelTake: vi.fn(), setPanelPick: vi.fn() }));

import { resolveOrgId } from "@/lib/dal";
import { resolveImpersonationState } from "@/lib/auth/impersonation";
import { getClientById } from "@/lib/db/clients";
import { getScript } from "@/lib/db/scripts";
import { getPanelTake, setPanelPick } from "@/lib/db/script-panels";

const TAKE = "9b1c2b1e-0000-4000-8000-000000000009";
const ctx = { params: Promise.resolve({ id: "c1", scriptId: SCRIPT_ID, shotId: "s06" }) };
const put = (body: unknown) =>
  new NextRequest(`http://localhost/api/clients/c1/scripts/${SCRIPT_ID}/panels/s06/pick`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(resolveOrgId).mockResolvedValue("org-1");
  vi.mocked(resolveImpersonationState).mockResolvedValue({ isImpersonating: false } as never);
  vi.mocked(getClientById).mockResolvedValue({ id: "c1", name: "Jackfruit365", org_id: "org-1" } as never);
  vi.mocked(getScript).mockResolvedValue(makeScript());
  vi.mocked(getPanelTake).mockResolvedValue(makeTake({ id: TAKE, shotId: "s06" }));
});

describe("PUT …/panels/:shotId/pick", () => {
  it("makes an earlier take the one the client sees (D343)", async () => {
    const { PUT } = await import("./route");
    const res = await PUT(put({ takeId: TAKE }), ctx);
    expect(res.status).toBe(200);
    expect(setPanelPick).toHaveBeenCalledWith(SCRIPT_ID, "s06", TAKE);
  });

  it("refuses another shot's take, a failed take, or one still drawing", async () => {
    const { PUT } = await import("./route");
    for (const take of [makeTake({ id: TAKE, shotId: "s07" }), makeTake({ id: TAKE, shotId: "s06", status: "failed" }), makeTake({ id: TAKE, shotId: "s06", status: "running" })]) {
      vi.mocked(getPanelTake).mockResolvedValueOnce(take);
      expect((await PUT(put({ takeId: TAKE }), ctx)).status).toBe(404);
    }
    expect(setPanelPick).not.toHaveBeenCalled();
  });

  it("refuses outside Visualise and In review", async () => {
    vi.mocked(getScript).mockResolvedValue(makeScript(undefined, "generate"));
    const { PUT } = await import("./route");
    expect((await PUT(put({ takeId: TAKE }), ctx)).status).toBe(409);
  });
});
