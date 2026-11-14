// src/app/api/orgs/[orgId]/people/route.test.ts
import { describe, it, expect, vi } from "vitest";
import { NextResponse } from "next/server";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: vi.fn() }));
const t = vi.hoisted(() => ({ canManage: true, guard: null as unknown }));
vi.mock("@/lib/api/route-helpers", async (orig) => ({
  ...(await orig<typeof import("@/lib/api/route-helpers")>()),
  withTeam: vi.fn(async (_req: Request, _p: unknown, guard: unknown, handler: (ctx: unknown) => Promise<NextResponse>) => {
    t.guard = guard;
    return handler({ orgId: "org-1", orgName: "Acme", viaAdmin: false, canManage: t.canManage, logAdmin: vi.fn() });
  }),
}));
vi.mock("@/lib/db/people", () => ({
  listAgencyPeople: vi.fn(async () => [{ userId: "u1", status: "owner" }]),
  listOpenInvites: vi.fn(async () => [{ id: "i1", link: "https://app.example/invite/tok" }]),
}));

import { GET } from "./route";

describe("GET /api/orgs/:orgId/people", () => {
  it("answers the agency's people and open invites in one response, for anyone with Invite", async () => {
    t.canManage = true;
    const res = await GET(new Request("http://x"), { params: Promise.resolve({ orgId: "org-1" }) });
    expect(t.guard).toEqual({ need: "invite" });
    expect(await res.json()).toEqual({ people: [{ userId: "u1", status: "owner" }], invites: [{ id: "i1", link: "https://app.example/invite/tok" }] });
  });

  it("withholds invite links from an Invite holder", async () => {
    t.canManage = false;
    const res = await GET(new Request("http://x"), { params: Promise.resolve({ orgId: "org-1" }) });
    expect((await res.json()).invites).toEqual([{ id: "i1", link: null }]);
  });
});
