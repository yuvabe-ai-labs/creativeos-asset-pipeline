import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({ resolveCallerContext: vi.fn(), resolveOrgId: vi.fn() }));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn() }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn(), setKBStatus: vi.fn() }));
vi.mock("@/lib/db/kb", () => ({ listKBDocuments: vi.fn() }));
vi.mock("@/lib/kb/changes/start", () => ({ startKbProposal: vi.fn() }));

import { resolveCallerContext, resolveOrgId } from "@/lib/dal";
import { resolveImpersonationState } from "@/lib/auth/impersonation";
import { getClientById, setKBStatus } from "@/lib/db/clients";
import { listKBDocuments } from "@/lib/db/kb";
import { startKbProposal } from "@/lib/kb/changes/start";

const D1 = "0b7d7a0e-6a4f-4c0e-9a55-1f1f8f3a2c11";
const OTHER = "0b7d7a0e-6a4f-4c0e-9a55-1f1f8f3a2c99";
const params = Promise.resolve({ id: "c1" });
const send = async (body: unknown) => {
  const { POST } = await import("./route");
  return POST(new NextRequest("http://localhost/api/clients/c1/kb/propose", { method: "POST", body: JSON.stringify(body) }), { params });
};

describe("POST /api/clients/:id/kb/propose", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(resolveOrgId).mockResolvedValue("o1");
    vi.mocked(resolveCallerContext).mockResolvedValue({ userId: "u1", orgId: "o1" } as never);
    vi.mocked(resolveImpersonationState).mockResolvedValue({ isImpersonating: false } as never);
    vi.mocked(getClientById).mockResolvedValue({ id: "c1", org_id: "o1", kb_status: "ready", active_kb_version_id: "v1" } as never);
    vi.mocked(listKBDocuments).mockResolvedValue([{ id: D1, filename: "guide.pdf" }] as never);
  });

  it("starts one proposal for the added and removed documents, by the server's own names", async () => {
    const res = await send({ added: [D1], removed: ["old.pdf"] });
    expect(await res.json()).toEqual({ started: true });
    expect(startKbProposal).toHaveBeenCalledWith("c1", "u1", { added: [{ id: D1, name: "guide.pdf" }], removed: ["old.pdf"] });
  });

  it("starts nothing when only images changed", async () => {
    expect(await (await send({ added: [], removed: [] })).json()).toEqual({ started: false });
    expect(startKbProposal).not.toHaveBeenCalled();
  });

  it("refuses a document id that is not this client's", async () => {
    expect((await send({ added: [OTHER], removed: [] })).status).toBe(400);
    expect(startKbProposal).not.toHaveBeenCalled();
  });

  it("refuses when there is no brand KB to propose against", async () => {
    vi.mocked(getClientById).mockResolvedValue({ id: "c1", org_id: "o1", active_kb_version_id: null } as never);
    expect((await send({ added: [D1], removed: [] })).status).toBe(409);
  });

  it("never changes kb_status", async () => {
    await send({ added: [D1], removed: ["old.pdf"] });
    expect(setKBStatus).not.toHaveBeenCalled();
  });

  it("refuses a malformed body", async () => {
    expect((await send({ added: "x" })).status).toBe(400);
  });
});
