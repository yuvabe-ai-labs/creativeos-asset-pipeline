import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeScript, SCRIPT_ID } from "@/lib/scripts/visualise/__tests__/fixtures";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({ resolveCallerContext: vi.fn(), resolveOrgId: vi.fn() }));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn() }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
vi.mock("@/lib/db/scripts", () => ({ getScript: vi.fn() }));
vi.mock("@/lib/db/script-visualise", () => ({ reopenScript: vi.fn() }));

import { resolveOrgId } from "@/lib/dal";
import { resolveImpersonationState } from "@/lib/auth/impersonation";
import { getClientById } from "@/lib/db/clients";
import { getScript } from "@/lib/db/scripts";
import { reopenScript } from "@/lib/db/script-visualise";

const params = Promise.resolve({ id: "c1", scriptId: SCRIPT_ID });
const post = () => new NextRequest(`http://localhost/api/clients/c1/scripts/${SCRIPT_ID}/reopen`, { method: "POST" });

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(resolveOrgId).mockResolvedValue("org-1");
  vi.mocked(resolveImpersonationState).mockResolvedValue({ isImpersonating: false } as never);
  vi.mocked(getClientById).mockResolvedValue({ id: "c1", name: "Jackfruit365", org_id: "org-1" } as never);
});

describe("POST …/scripts/:scriptId/reopen", () => {
  it("sends a Visualise script back to Generate", async () => {
    vi.mocked(getScript).mockResolvedValue(makeScript());
    vi.mocked(reopenScript).mockResolvedValue(makeScript(undefined, "generate"));
    const { POST } = await import("./route");
    const res = await POST(post(), { params });
    expect(res.status).toBe(200);
    expect((await res.json()).script.stage).toBe("generate");
  });

  it("refuses from any other stage", async () => {
    vi.mocked(getScript).mockResolvedValue(makeScript(undefined, "in_review"));
    const { POST } = await import("./route");
    expect((await POST(post(), { params })).status).toBe(409);
    expect(reopenScript).not.toHaveBeenCalled();
  });

  it("is a 409 when someone moved it in the meantime, and a 404 for a script that is not there", async () => {
    vi.mocked(getScript).mockResolvedValueOnce(makeScript());
    vi.mocked(reopenScript).mockResolvedValue(null);
    const { POST } = await import("./route");
    expect((await POST(post(), { params })).status).toBe(409);
    vi.mocked(getScript).mockResolvedValueOnce(null);
    expect((await POST(post(), { params })).status).toBe(404);
  });
});
