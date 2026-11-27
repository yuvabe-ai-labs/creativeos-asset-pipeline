import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({
  updateUser: vi.fn(async () => ({ error: null as null | { code?: string; status?: number; message: string } })),
  refreshSession: vi.fn(async () => ({})),
  setMustChangePassword: vi.fn(async () => undefined),
  order: [] as string[],
}));
vi.mock("@/lib/db/organizations", () => ({ setMustChangePassword: m.setMustChangePassword }));

import { PASSWORD_NOT_SET, SAME_PASSWORD, setOwnPassword } from "./set-own-password";

const supabase = { auth: { updateUser: m.updateUser, refreshSession: m.refreshSession } } as never;

describe("setOwnPassword (D598)", () => {
  beforeEach(() => {
    m.order.length = 0;
    m.updateUser.mockClear().mockImplementation(async () => { m.order.push("update"); return { error: null }; });
    m.setMustChangePassword.mockClear().mockImplementation(async () => { m.order.push("clear"); });
    m.refreshSession.mockClear().mockImplementation(async () => { m.order.push("refresh"); return {}; });
  });

  it("sets the password, then clears the flag before refreshing the session", async () => {
    expect(await setOwnPassword(supabase, { userId: "u1", password: "goodpass123", clearMustChange: true })).toEqual({});
    expect(m.updateUser).toHaveBeenCalledWith({ password: "goodpass123" });
    expect(m.setMustChangePassword).toHaveBeenCalledWith("u1", false);
    expect(m.order).toEqual(["update", "clear", "refresh"]);
  });

  it("leaves the flag alone when there is none to clear", async () => {
    await setOwnPassword(supabase, { userId: "u1", password: "goodpass123", clearMustChange: false });
    expect(m.order).toEqual(["update"]);
  });

  it("answers in plain words, never the service's message", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    m.updateUser.mockResolvedValueOnce({ error: { code: "same_password", status: 422, message: "New password should be different from the old password." } });
    expect(await setOwnPassword(supabase, { userId: "u1", password: "goodpass123", clearMustChange: true })).toEqual({ error: SAME_PASSWORD });
    m.updateUser.mockResolvedValueOnce({ error: { status: 500, message: "db down" } });
    expect(await setOwnPassword(supabase, { userId: "u1", password: "goodpass123", clearMustChange: true })).toEqual({ error: PASSWORD_NOT_SET });
    expect(m.setMustChangePassword).not.toHaveBeenCalled();
    expect(JSON.stringify(log.mock.calls)).not.toContain("goodpass123");
    log.mockRestore();
  });
});
