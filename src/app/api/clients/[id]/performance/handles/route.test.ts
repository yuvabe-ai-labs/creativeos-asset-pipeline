import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({
  resolveCallerContext: vi.fn(async () => ({
    userId: "user-1", platformRole: "member", orgId: "org-1", orgRole: "designer",
    mustChangePassword: false,
  })),
  resolveOrgId: vi.fn(async () => "org-1"),
}));
vi.mock("@/lib/auth/impersonation", () => ({
  resolveImpersonationState: vi.fn(async () => ({ isImpersonating: false })),
}));
vi.mock("@/lib/db/impersonation-audit", () => ({
  logImpersonationEvent: vi.fn(async () => undefined),
}));
vi.mock("@/lib/db/clients", () => ({
  getClientById: vi.fn(async () => ({ id: "client-1", org_id: "org-1", slug: "acme", name: "Acme" })),
}));
vi.mock("@/lib/db/performance", () => ({
  listTrackedHandles: vi.fn(),
  addTrackedHandle: vi.fn(),
}));

import { listTrackedHandles, addTrackedHandle } from "@/lib/db/performance";

const params = Promise.resolve({ id: "client-1" });
const getReq = () => new Request("http://test/api/clients/client-1/performance/handles");
const postReq = (body: unknown) =>
  new Request("http://test/api/clients/client-1/performance/handles", {
    method: "POST",
    body: JSON.stringify(body),
  });

const ROW = {
  id: "h1", client_id: "client-1", platform: "instagram",
  handle: "prakritisattva", added_at: "2026-09-08T00:00:00.000Z",
};

describe("GET /api/clients/[id]/performance/handles", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns the tracked handles", async () => {
    vi.mocked(listTrackedHandles).mockResolvedValue([ROW]);
    const { GET } = await import("./route");
    const res = await GET(getReq() as never, { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.handles).toHaveLength(1);
    expect(body.handles[0].handle).toBe("prakritisattva");
  });

  it("returns an empty list rather than erroring when nothing is tracked", async () => {
    vi.mocked(listTrackedHandles).mockResolvedValue([]);
    const { GET } = await import("./route");
    const res = await GET(getReq() as never, { params });
    expect(res.status).toBe(200);
    expect((await res.json()).handles).toEqual([]);
  });

  it("does not read Brand Kit (D252)", async () => {
    // The payload carries handles and nothing else — no suggestion field, so no
    // caller can start depending on a Brand Kit read sneaking back in.
    vi.mocked(listTrackedHandles).mockResolvedValue([ROW]);
    const { GET } = await import("./route");
    const body = await (await GET(getReq() as never, { params })).json();
    expect(Object.keys(body)).toEqual(["handles"]);
  });
});

describe("POST /api/clients/[id]/performance/handles", () => {
  beforeEach(() => vi.resetAllMocks());

  it("canonicalizes the handle before storing it", async () => {
    vi.mocked(addTrackedHandle).mockResolvedValue(ROW);
    const { POST } = await import("./route");
    const res = await POST(postReq({ handle: " @PrakritiSattva " }) as never, { params });
    expect(res.status).toBe(201);
    expect(vi.mocked(addTrackedHandle)).toHaveBeenCalledWith("client-1", "prakritisattva");
  });

  it("accepts a pasted profile URL", async () => {
    vi.mocked(addTrackedHandle).mockResolvedValue(ROW);
    const { POST } = await import("./route");
    await POST(postReq({ handle: "https://www.instagram.com/prakritisattva/?igsh=x" }) as never, { params });
    expect(vi.mocked(addTrackedHandle)).toHaveBeenCalledWith("client-1", "prakritisattva");
  });

  it("rejects input the parser cannot canonicalize", async () => {
    const { POST } = await import("./route");
    const res = await POST(postReq({ handle: "not a handle!!" }) as never, { params });
    expect(res.status).toBe(400);
    expect(vi.mocked(addTrackedHandle)).not.toHaveBeenCalled();
  });

  it("rejects a missing handle", async () => {
    const { POST } = await import("./route");
    const res = await POST(postReq({}) as never, { params });
    expect(res.status).toBe(400);
  });
});
