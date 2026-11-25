import { describe, it, expect, vi, beforeEach } from "vitest";
import { testAccess, testOwnerAccess } from "@/lib/permissions/test-fixtures";
import type { Access } from "@/lib/permissions/model";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const { callerMock } = vi.hoisted(() => ({ callerMock: vi.fn() }));
vi.mock("@/lib/dal", () => ({ resolveCallerContext: callerMock, resolveOrgId: vi.fn(async () => "org-1") }));
vi.mock("@/lib/auth/impersonation", () => ({
  resolveImpersonationState: vi.fn(async () => ({ isImpersonating: false })),
}));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn(async () => undefined) }));
vi.mock("@/lib/db/review", () => ({ listOrgReviewInbox: vi.fn(async () => []) }));

import { listOrgReviewInbox } from "@/lib/db/review";
import { GET } from "./route";

const as = (access: Access) => callerMock.mockResolvedValue({ userId: "u1", orgId: "org-1", access });
const get = () => GET(new Request("http://test/api/review/inbox"));
const scopeOf = () => vi.mocked(listOrgReviewInbox).mock.calls[0][2];

describe("GET /api/review/inbox", () => {
  beforeEach(() => vi.mocked(listOrgReviewInbox).mockClear());

  it("lists no pending work for someone who can approve nothing", async () => {
    as(testAccess({ permissions: ["generate"], clientIds: ["c-1"] }));
    const res = await get();
    expect(res.status).toBe(200);
    expect(scopeOf().reviewTypes).toEqual([]);
    expect(scopeOf().clientIds).toEqual(["c-1"]);
  });

  it("lists pending work for an approver, on the clients where they approve", async () => {
    as(testAccess({ permissions: ["approve"], clientIds: ["c-1"] }));
    await get();
    expect(scopeOf().reviewTypes).toEqual(["image-gen", "video-gen"]);
    expect(scopeOf().pendingClientIds).toEqual(["c-1"]);
  });

  it("keeps pending work to the clients where the person approves, not every client they view", async () => {
    as(testAccess({ permissions: [], clientIds: [], clients: { "c-a": ["approve"], "c-b": [] } }));
    await get();
    expect(scopeOf().pendingClientIds).toEqual(["c-a"]);
    expect(scopeOf().clientIds).toEqual(["c-a", "c-b"]);
  });

  it("lists every client for the owner", async () => {
    as(testOwnerAccess());
    await get();
    expect(scopeOf().reviewTypes).toEqual(["image-gen", "video-gen"]);
    expect(scopeOf().pendingClientIds).toBeNull();
    expect(scopeOf().clientIds).toBeNull();
  });
});
