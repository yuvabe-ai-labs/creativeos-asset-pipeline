import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/api/route-helpers", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/route-helpers")>("@/lib/api/route-helpers");
  return {
    ...actual,
    withClient: (_r: Request, _p: unknown, _g: unknown, fn: (...a: unknown[]) => Promise<Response>) =>
      fn("client-a", { id: "client-a", slug: "acme" }, { userId: "u1" }, "org-1"),
  };
});
vi.mock("@/lib/db/clients", () => ({ setKBStatus: vi.fn() }));
vi.mock("@/lib/kb/fill-rate", () => ({ computeReadyStatus: vi.fn(() => true) }));

// The version read: records its filters, and finds a row only when it is client-a's version.
const { eqs } = vi.hoisted(() => ({ eqs: [] as Array<[string, unknown]> }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: () => {
    const chain = {
      from: () => chain,
      select: () => chain,
      eq: (col: string, val: unknown) => {
        eqs.push([col, val]);
        return chain;
      },
      maybeSingle: async () => {
        const mine = eqs.some(([c, v]) => c === "client_id" && v === "client-a") && eqs.some(([c, v]) => c === "id" && v === "ver-a");
        return { data: mine ? { output: {} } : null, error: null };
      },
    };
    return chain;
  },
}));

import { setKBStatus } from "@/lib/db/clients";
import { POST } from "./route";

const post = (versionId: string) =>
  POST(new Request("http://x/api/clients/client-a/kb/ready", { method: "POST", body: JSON.stringify({ versionId }) }), {
    params: Promise.resolve({ id: "client-a" }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  eqs.length = 0;
});

describe("POST /api/clients/[id]/kb/ready", () => {
  it("marks the client ready from its own reviewed version", async () => {
    expect((await post("ver-a")).status).toBe(200);
    expect(setKBStatus).toHaveBeenCalledWith("client-a", "ready");
  });

  // The version id comes from the body. Another client's reviewed version must not mark
  // this client's brand kit ready.
  it("404s on another client's version and marks nothing", async () => {
    expect((await post("ver-b")).status).toBe(404);
    expect(setKBStatus).not.toHaveBeenCalled();
  });
});
