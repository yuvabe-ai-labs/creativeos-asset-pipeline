import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeScript, SCRIPT_ID } from "@/lib/scripts/visualise/__tests__/fixtures";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({ resolveCallerContext: vi.fn(), resolveOrgId: vi.fn() }));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn() }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
vi.mock("@/lib/db/scripts", () => ({ getScript: vi.fn() }));
vi.mock("@/lib/avatars/brief", () => ({ briefFront: vi.fn() }));
vi.mock("@/lib/db/kb", () => ({ getActiveKBVersion: vi.fn() }));

import { resolveOrgId } from "@/lib/dal";
import { resolveImpersonationState } from "@/lib/auth/impersonation";
import { getClientById } from "@/lib/db/clients";
import { getScript } from "@/lib/db/scripts";
import { briefFront } from "@/lib/avatars/brief";
import { getActiveKBVersion } from "@/lib/db/kb";

const paramsFor = (castId: string) => Promise.resolve({ id: "c1", scriptId: SCRIPT_ID, castId });
const post = (body: unknown) =>
  new NextRequest(`http://localhost/api/clients/c1/scripts/${SCRIPT_ID}/cast/meenakshi/brief`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
const FRONT = { description: "A 40-year-old South Asian woman.", attributes: { gender: "Female" } };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(resolveOrgId).mockResolvedValue("org-1");
  vi.mocked(resolveImpersonationState).mockResolvedValue({ isImpersonating: false } as never);
  vi.mocked(getClientById).mockResolvedValue({ id: "c1", name: "Jackfruit365", org_id: "org-1" } as never);
  vi.mocked(getScript).mockResolvedValue(makeScript());
  vi.mocked(briefFront).mockResolvedValue(FRONT);
  vi.mocked(getActiveKBVersion).mockResolvedValue({
    output: { target_audience: { human_casting: { value: "Working Indian adults, 25 to 45, real not model-like" }, lifestyle: { value: "Busy city homes" } } },
  } as never);
});

describe("POST …/cast/:castId/brief (D395)", () => {
  it("briefs the cast member as the stored script describes them, with the instructions", async () => {
    const script = makeScript();
    const member = script.doc.cast.find((c) => c.id === "meenakshi")!;
    const { POST } = await import("./route");
    const res = await POST(post({ instructions: "Greyer at the temples" }), { params: paramsFor("meenakshi") });
    expect(res.status).toBe(200);
    expect(getScript).toHaveBeenCalledWith("c1", SCRIPT_ID);
    expect(briefFront).toHaveBeenCalledWith({
      name: member.name, description: member.description, setting: script.doc.header.region, instructions: "Greyer at the temples",
      // D459 — the reel around them: its place, the shots they are in, and the brand's casting.
      place: script.doc.context.settingAndCamera,
      shots: script.doc.shots.filter((s) => s.onScreen.includes("meenakshi")).slice(0, 8).map((s) => s.visual),
      brand: "Jackfruit365\nHuman casting: Working Indian adults, 25 to 45, real not model-like\nAudience lifestyle: Busy city homes",
    });
    expect(await res.json()).toEqual(FRONT);
  });

  it("is a 404 for a person not in this script", async () => {
    const { POST } = await import("./route");
    expect((await POST(post({ instructions: "" }), { params: paramsFor("nobody") })).status).toBe(404);
    expect(briefFront).not.toHaveBeenCalled();
  });

  it("is a 404 for another client's or a missing script", async () => {
    vi.mocked(getScript).mockResolvedValue(null);
    const { POST } = await import("./route");
    expect((await POST(post({ instructions: "" }), { params: paramsFor("meenakshi") })).status).toBe(404);
  });

  it("is a 400 without instructions", async () => {
    const { POST } = await import("./route");
    expect((await POST(post({}), { params: paramsFor("meenakshi") })).status).toBe(400);
  });
});
