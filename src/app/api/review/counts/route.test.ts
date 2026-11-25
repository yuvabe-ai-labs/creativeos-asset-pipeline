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
vi.mock("@/lib/db/review", () => ({
  getOrgReviewCounts: vi.fn(async () => ({ byClient: {}, byCanvas: {}, total: 0 })),
}));

import { getOrgReviewCounts } from "@/lib/db/review";
import { GET } from "./route";

const as = (access: Access) => callerMock.mockResolvedValue({ userId: "u1", orgId: "org-1", access });
const get = () => GET(new Request("http://test/api/review/counts"));

describe("GET /api/review/counts", () => {
  beforeEach(() => vi.mocked(getOrgReviewCounts).mockClear());

  it("counts no client for someone who can approve nothing", async () => {
    as(testAccess({ permissions: ["generate"], clientIds: ["c-1"] }));
    expect((await get()).status).toBe(200);
    expect(getOrgReviewCounts).toHaveBeenCalledWith("org-1", []);
  });

  it("counts only the clients where the person approves", async () => {
    as(testAccess({ permissions: [], clientIds: [], clients: { "c-a": ["approve"], "c-b": [] } }));
    await get();
    expect(getOrgReviewCounts).toHaveBeenCalledWith("org-1", ["c-a"]);
  });

  it("counts every client for the owner", async () => {
    as(testOwnerAccess());
    await get();
    expect(getOrgReviewCounts).toHaveBeenCalledWith("org-1", null);
  });
});
