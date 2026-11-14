// src/app/api/orgs/[orgId]/people/route.test.ts
import { describe, it, expect, vi } from "vitest";
import { NextResponse } from "next/server";
import { testAccess, testOwnerAccess } from "@/lib/permissions/test-fixtures";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: vi.fn() }));
const t = vi.hoisted(() => ({ canManage: true, guard: null as unknown, access: null as unknown }));
vi.mock("@/lib/api/route-helpers", async (orig) => ({
  ...(await orig<typeof import("@/lib/api/route-helpers")>()),
  withTeam: vi.fn(async (_req: Request, _p: unknown, guard: unknown, handler: (ctx: unknown) => Promise<NextResponse>) => {
    t.guard = guard;
    return handler({ orgId: "org-1", orgName: "Acme", caller: { userId: "u9", access: t.access }, viaAdmin: false, canManage: t.canManage, logAdmin: vi.fn() });
  }),
}));

const OWNER = { userId: "u1", name: "Owner", status: "owner", permissions: [], invitedClient: null, clientIds: [] };
const ON_BOTH = { userId: "u2", name: "Ravi", status: "member", permissions: ["generate"], invitedClient: { id: "cB", name: "Bata" }, clientIds: ["cA", "cB"] };
const ON_B = { userId: "u3", name: "Mira", status: "member", permissions: ["approve"], invitedClient: { id: "cB", name: "Bata" }, clientIds: ["cB"] };
const INVITE_A = { id: "iA", email: "a@x.com", clientId: "cA", clientName: "Chupps", link: "https://app.example/invite/a" };
const INVITE_B = { id: "iB", email: "b@x.com", clientId: "cB", clientName: "Bata", link: "https://app.example/invite/b" };
vi.mock("@/lib/db/people", () => ({
  listAgencyPeople: vi.fn(async () => [OWNER, ON_BOTH, ON_B]),
  listOpenInvites: vi.fn(async () => [INVITE_A, INVITE_B]),
}));

import { GET } from "./route";

const read = async () => (await GET(new Request("http://x"), { params: Promise.resolve({ orgId: "org-1" }) })).json();

describe("GET /api/orgs/:orgId/people", () => {
  it("answers the owner every person and open invite, links included", async () => {
    t.canManage = true;
    t.access = testOwnerAccess();
    const body = await read();
    expect(t.guard).toEqual({ need: "invite" });
    expect(body).toEqual({ people: [OWNER, ON_BOTH, ON_B], invites: [INVITE_A, INVITE_B] });
  });

  it("shows an Invite holder on client A nothing of client B, and no links or permissions", async () => {
    t.canManage = false;
    t.access = testAccess({ permissions: [], clientIds: [], clients: { cA: ["invite"] } });
    const body = await read();
    expect(body.invites).toEqual([{ ...INVITE_A, link: null }]);
    expect(body.people).toEqual([
      { ...OWNER, permissions: [] },
      { ...ON_BOTH, permissions: [], invitedClient: null, clientIds: ["cA"] },
      { ...ON_B, permissions: [], invitedClient: null, clientIds: [] },
    ]);
    expect(JSON.stringify(body)).not.toContain("cB");
    expect(JSON.stringify(body)).not.toContain("Bata");
  });
});
