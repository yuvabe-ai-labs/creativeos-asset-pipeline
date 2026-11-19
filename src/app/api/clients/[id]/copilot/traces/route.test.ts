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

describe("GET /api/clients/:id/copilot/traces", () => {
  beforeEach(setup);

  it("lists one client's lines from the last 30 days, without trace bodies", async () => {
    vi.mocked(listTurnLines).mockResolvedValue([line]);
    const { GET } = await import("./route");
    const res = await GET(new NextRequest("http://localhost/api/clients/c1/copilot/traces"), { params: Promise.resolve({ id: "c1" }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ lines: [line] });
    const [clientId, since, limit] = vi.mocked(listTurnLines).mock.calls[0];
    expect(clientId).toBe("c1");
    expect(limit).toBe(50);
    const days = (Date.now() - Date.parse(since)) / 86_400_000;
    expect(days).toBeGreaterThan(29.99);
    expect(days).toBeLessThan(30.01);
  });
});
