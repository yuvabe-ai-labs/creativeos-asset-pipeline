import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// vi.hoisted() required: vi.mock() factories are hoisted above plain top-level consts
// (same gotcha documented in Tasks 4, 6, and 10's test files).
const { redirectMock, startImpersonationMock, enterElevatedModeMock, endImpersonationMock } =
  vi.hoisted(() => ({
    redirectMock: vi.fn((path: string) => {
      throw new Error(`REDIRECT:${path}`);
    }),
    startImpersonationMock: vi.fn(async () => undefined),
    enterElevatedModeMock: vi.fn(async () => undefined),
    endImpersonationMock: vi.fn(async () => undefined),
  }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

vi.mock("@/lib/auth/require-super-admin", () => ({ requireSuperAdmin: vi.fn(async () => undefined) }));

vi.mock("@/lib/auth/impersonation", () => ({
  startImpersonation: startImpersonationMock,
  enterElevatedMode: enterElevatedModeMock,
  endImpersonation: endImpersonationMock,
}));

import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import {
  enterImpersonationAction,
  enterElevatedModeAction,
  exitImpersonationAction,
} from "./impersonation";

describe("impersonation server actions", () => {
  beforeEach(() => vi.resetAllMocks());

  it("enterImpersonationAction requires super_admin, starts the session, redirects to /", async () => {
    await expect(enterImpersonationAction("org-2")).rejects.toThrow("REDIRECT:/");
    expect(requireSuperAdmin).toHaveBeenCalled();
    expect(startImpersonationMock).toHaveBeenCalledWith("org-2");
  });

  it("enterElevatedModeAction requires super_admin and flips elevated mode, no redirect", async () => {
    await enterElevatedModeAction();
    expect(requireSuperAdmin).toHaveBeenCalled();
    expect(enterElevatedModeMock).toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("exitImpersonationAction ends the session and redirects to /admin/orgs/[id]", async () => {
    await expect(exitImpersonationAction("org-2")).rejects.toThrow("REDIRECT:/admin/orgs/org-2");
    expect(endImpersonationMock).toHaveBeenCalled();
  });
});
