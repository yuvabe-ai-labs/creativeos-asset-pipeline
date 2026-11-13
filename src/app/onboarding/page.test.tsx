import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("server-only", () => ({}));
const { actingMock, redirectMock } = vi.hoisted(() => ({
  actingMock: vi.fn(),
  redirectMock: vi.fn((to: string) => { throw new Error(`REDIRECT ${to}`); }),
}));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/lib/permissions/server", async (orig) => ({ ...(await orig<typeof import("@/lib/permissions/server")>()), resolveActingCaller: actingMock }));

import OnboardingPage from "./page";
import { testAccess } from "@/lib/permissions/test-fixtures";

describe("/onboarding", () => {
  beforeEach(() => vi.clearAllMocks());

  it("tells a waiting person their agency is setting up their access", async () => {
    actingMock.mockResolvedValue({
      caller: { userId: "u1", orgId: "org-1", access: testAccess({ permissions: [], clientIds: ["c1"], accessGiven: false }) },
      effectiveOrgId: "org-1",
      impersonation: { isImpersonating: false },
    });
    const html = renderToStaticMarkup(await OnboardingPage());
    expect(html).toContain("You&#x27;re being onboarded. Hang in there.");
    expect(html).toContain("Yuvabe Studios is setting up your access. Your clients will appear here once it&#x27;s ready.");
  });

  it("sends anyone with access home", async () => {
    actingMock.mockResolvedValue({
      caller: { userId: "u1", orgId: "org-1", access: testAccess({ permissions: ["view"], clientIds: ["c1"] }) },
      effectiveOrgId: "org-1",
      impersonation: { isImpersonating: false },
    });
    await expect(OnboardingPage()).rejects.toThrow("REDIRECT /");
  });
});
