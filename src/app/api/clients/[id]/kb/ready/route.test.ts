import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const { guards } = vi.hoisted(() => ({ guards: [] as unknown[] }));
const client = { id: "client-a", slug: "acme", active_kb_version_id: "ver-a" };
vi.mock("@/lib/api/route-helpers", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/route-helpers")>("@/lib/api/route-helpers");
  return {
    ...actual,
    withClient: (_r: Request, _p: unknown, guard: unknown, fn: (...a: unknown[]) => Promise<Response>) => {
      guards.push(guard);
      return fn("client-a", client, { userId: "u1" }, "org-1");
    },
  };
});
vi.mock("@/lib/kb/approve", () => ({ approveKB: vi.fn() }));

import { approveKB } from "@/lib/kb/approve";
import { POST } from "./route";

const post = (body: unknown) =>
  POST(new Request("http://x/api/clients/client-a/kb/ready", { method: "POST", body: JSON.stringify(body) }), {
    params: Promise.resolve({ id: "client-a" }),
  });

const VERSION = "8a4c2f1e-3b5d-4c6e-9f70-1a2b3c4d5e6f";

beforeEach(() => {
  vi.clearAllMocks();
  guards.length = 0;
  vi.mocked(approveKB).mockResolvedValue({ ok: true });
});

describe("POST /api/clients/[id]/kb/ready", () => {
  it("needs Edit on the client and approves as the caller, for the version they were looking at", async () => {
    expect((await post({ versionId: VERSION })).status).toBe(200);
    expect(guards).toEqual([{ need: "edit" }]);
    expect(approveKB).toHaveBeenCalledWith({ client, userId: "u1", versionId: VERSION });
  });

  it("passes on why the approval was refused", async () => {
    vi.mocked(approveKB).mockResolvedValue({ error: "The brand KB was rebuilt. Reload to see the new one." });
    const res = await post({ versionId: VERSION });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("The brand KB was rebuilt. Reload to see the new one.");
  });

  it("refuses a version id that is not an id, without approving anything", async () => {
    expect((await post({ versionId: "ver-b" })).status).toBe(400);
    expect(approveKB).not.toHaveBeenCalled();
  });
});
