import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({ resolveCallerContext: vi.fn(), resolveOrgId: vi.fn() }));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn() }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
vi.mock("@/lib/db/copilot-traces", () => ({ listTurnLines: vi.fn(), getTurnTrace: vi.fn() }));

import { resolveCallerContext, resolveOrgId } from "@/lib/dal";
import { resolveImpersonationState } from "@/lib/auth/impersonation";
import { getClientById } from "@/lib/db/clients";
import { getTurnTrace, listTurnLines } from "@/lib/db/copilot-traces";

const setup = () => {
  vi.resetAllMocks();
  vi.mocked(resolveOrgId).mockResolvedValue("o1");
  vi.mocked(resolveCallerContext).mockResolvedValue({ userId: "u1" } as never);
  vi.mocked(resolveImpersonationState).mockResolvedValue({ isImpersonating: false } as never);
  vi.mocked(getClientById).mockResolvedValue({ id: "c1", slug: "acme", org_id: "o1" } as never);
};
const T1 = "0b7d7a0e-6a4f-4c0e-9a55-1f1f8f3a2c55";
const line = { id: T1, messageId: null, createdAt: "2026-11-19T10:00:00Z", sentText: "hi", tools: [], marks: [], durationMs: 900 };

const get = async (traceId: string) => {
  const { GET } = await import("./route");
  return GET(new NextRequest(`http://localhost/api/clients/c1/copilot/traces/${traceId}`), { params: Promise.resolve({ id: "c1", traceId }) });
};

describe("GET /api/clients/:id/copilot/traces/:traceId", () => {
  beforeEach(setup);

  it("returns one trace of this client", async () => {
    vi.mocked(getTurnTrace).mockResolvedValue({ ...line, trace: { reply: "ok" } as never });
    const res = await get(T1);
    expect(res.status).toBe(200);
    expect((await res.json()).trace).toEqual({ reply: "ok" });
    expect(getTurnTrace).toHaveBeenCalledWith("c1", T1);
  });

  it("refuses a trace of another client, or one that is gone", async () => {
    vi.mocked(getTurnTrace).mockResolvedValue(null);
    const res = await get(T1);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("That trace is gone.");
  });

  it("refuses a trace id that is not a uuid, without reading", async () => {
    const res = await get("nope");
    expect(res.status).toBe(400);
    expect(getTurnTrace).not.toHaveBeenCalled();
  });
});
