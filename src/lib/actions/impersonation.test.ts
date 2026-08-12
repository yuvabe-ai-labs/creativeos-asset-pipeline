import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// vi.hoisted() required: vi.mock() factories are hoisted above plain top-level consts.
const {
  redirectMock,
  revalidatePathMock,
  startImpersonationMock,
  enterElevatedModeMock,
  endImpersonationMock,
} = vi.hoisted(() => ({
  redirectMock: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
  revalidatePathMock: vi.fn(),
  startImpersonationMock: vi.fn(async () => undefined),
  enterElevatedModeMock: vi.fn(async () => undefined),
  endImpersonationMock: vi.fn(async () => undefined),
}));

vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/auth/require-super-admin", () => ({
  requireSuperAdmin: vi.fn(async () => undefined),
}));
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
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // D140: a server redirect() unmounts the caller before it can toast, which is the
  // whole reason these transitions felt like nothing happened. None of them redirect.
  it("enterImpersonationAction requires super_admin, starts the session, and returns", async () => {
    await expect(enterImpersonationAction("org-2")).resolves.toBeUndefined();
    expect(requireSuperAdmin).toHaveBeenCalled();
    expect(startImpersonationMock).toHaveBeenCalledWith("org-2");
    expect(revalidatePathMock).toHaveBeenCalledWith("/", "layout");
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("enterElevatedModeAction requires super_admin and flips elevated mode", async () => {
    await expect(enterElevatedModeAction()).resolves.toBeUndefined();
    expect(requireSuperAdmin).toHaveBeenCalled();
    expect(enterElevatedModeMock).toHaveBeenCalled();
    expect(revalidatePathMock).toHaveBeenCalledWith("/", "layout");
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("exitImpersonationAction ends the session and returns, taking no orgId", async () => {
    await expect(exitImpersonationAction()).resolves.toBeUndefined();
    expect(endImpersonationMock).toHaveBeenCalled();
    expect(revalidatePathMock).toHaveBeenCalledWith("/", "layout");
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("propagates a failure instead of swallowing it, so the client can toast it", async () => {
    startImpersonationMock.mockRejectedValueOnce(new Error("Organization not found."));
    await expect(enterImpersonationAction("nope")).rejects.toThrow(
      "Organization not found.",
    );
  });
});
