import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { redirectMock } = vi.hoisted(() => ({ redirectMock: vi.fn((to: string) => { throw new Error(`REDIRECT ${to}`); }) }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

import { sendWaitingToOnboarding } from "./onboarding";
import { testAccess, testOwnerAccess } from "./test-fixtures";
import type { Access } from "./model";

const acting = (access: Access) => ({ caller: { userId: "u1", orgId: "org-1", access }, effectiveOrgId: "org-1", impersonation: { isImpersonating: false as const } });

describe("sendWaitingToOnboarding (spec §2.4)", () => {
  it("sends someone signed up and waiting to /onboarding", () => {
    expect(() => sendWaitingToOnboarding(acting(testAccess({ permissions: [], clientIds: ["c1"], accessGiven: false })) as never)).toThrow("REDIRECT /onboarding");
  });

  it("sends a member on no client to /onboarding", () => {
    expect(() => sendWaitingToOnboarding(acting(testAccess({ permissions: [], clientIds: [] })) as never)).toThrow("REDIRECT /onboarding");
  });

  it("lets a member with a client, and the owner with none, through", () => {
    expect(() => sendWaitingToOnboarding(acting(testAccess({ permissions: [], clientIds: ["c1"] })) as never)).not.toThrow();
    expect(() => sendWaitingToOnboarding(acting(testOwnerAccess()) as never)).not.toThrow();
  });
});
