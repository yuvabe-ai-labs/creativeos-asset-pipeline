import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({
  take: vi.fn(() => true),
  send: vi.fn(async () => undefined),
  after: vi.fn(),
  cookieSet: vi.fn(),
  cookieDelete: vi.fn(),
  verifyOtp: vi.fn(),
  setOwnPassword: vi.fn(async () => ({})),
  setMustChange: vi.fn(async () => undefined),
  endImpersonation: vi.fn(async () => undefined),
  redirect: vi.fn((to: string) => { throw new Error(`REDIRECT ${to}`); }),
}));
vi.mock("@/lib/auth/throttle", () => ({ takeResetCooldown: m.take }));
vi.mock("@/lib/auth/password-reset", () => ({ sendPasswordResetLink: m.send }));
vi.mock("next/server", () => ({ after: m.after }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ set: m.cookieSet, delete: m.cookieDelete }),
}));
vi.mock("@/lib/supabase/ssr-server", () => ({ createSSRServerClient: vi.fn(async () => ({ auth: { verifyOtp: m.verifyOtp } })) }));
vi.mock("@/lib/auth/set-own-password", () => ({ setOwnPassword: m.setOwnPassword }));
vi.mock("@/lib/db/organizations", () => ({ setMustChangePassword: m.setMustChange }));
vi.mock("@/lib/auth/impersonation", () => ({ endImpersonation: m.endImpersonation }));
vi.mock("next/navigation", () => ({ redirect: m.redirect }));

import { requestPasswordResetAction, resetPasswordAction } from "./password-reset";
import { LINK_EXPIRED, RESET_COOLDOWN_MS, RESET_LINK_SENT, RESET_TOO_MANY } from "@/lib/auth/password-reset-schema";

const emailForm = (email: string) => {
  const f = new FormData();
  f.set("email", email);
  return f;
};
const passwordForm = (password: string, confirmPassword = password) => {
  const f = new FormData();
  f.set("password", password);
  f.set("confirmPassword", confirmPassword);
  return f;
};

beforeEach(() => {
  for (const fn of Object.values(m)) if (typeof fn === "function" && "mockClear" in fn) fn.mockClear();
  m.take.mockReturnValue(true);
  m.setOwnPassword.mockResolvedValue({});
  // after() runs its work once the answer has gone; here, straight away, so it can be seen.
  m.after.mockImplementation((fn: () => unknown) => void fn());
});

describe("requestPasswordResetAction (D598)", () => {
  it("answers the same whether or not an account exists, and makes the link after answering", async () => {
    const known = await requestPasswordResetAction(undefined, emailForm("asha@example.com"));
    const unknown = await requestPasswordResetAction(undefined, emailForm("nobody@example.com"));
    expect(known).toEqual({ sent: true });
    expect(unknown).toEqual(known);
    expect(m.after).toHaveBeenCalledTimes(2);
    expect(m.send).toHaveBeenCalledWith("asha@example.com");
    expect(m.send).toHaveBeenCalledWith("nobody@example.com");
    // The page shows this one sentence for both.
    expect(RESET_LINK_SENT).toBe("If an account exists for that email, we've sent a link to set a new password. It works for 1 hour.");
  });

  it("waits a minute per email (lowercased) between links", async () => {
    await requestPasswordResetAction(undefined, emailForm(" Asha@Example.com "));
    expect(m.take).toHaveBeenCalledWith("asha@example.com", RESET_COOLDOWN_MS);
    expect(RESET_COOLDOWN_MS).toBe(60_000);
    expect(m.send).toHaveBeenCalledWith("asha@example.com");
  });

  it("sends nothing inside the wait", async () => {
    m.take.mockReturnValueOnce(false);
    expect(await requestPasswordResetAction(undefined, emailForm("asha@example.com"))).toEqual({ error: RESET_TOO_MANY, email: "asha@example.com" });
    expect(m.after).not.toHaveBeenCalled();
    expect(m.send).not.toHaveBeenCalled();
  });

  it("refuses something that isn't an email before counting anything", async () => {
    expect(await requestPasswordResetAction(undefined, emailForm("asha"))).toEqual({ error: "Enter a valid email.", email: "asha" });
    expect(m.take).not.toHaveBeenCalled();
  });
});

describe("resetPasswordAction (D598)", () => {
  const user = { id: "u1", app_metadata: {} };

  it("checks the token on submit, sets the password, and goes where sign-in goes with the message", async () => {
    m.verifyOtp.mockResolvedValue({ data: { user }, error: null });
    await expect(resetPasswordAction("tok", undefined, passwordForm("goodpass123"))).rejects.toThrow("REDIRECT /");
    expect(m.verifyOtp).toHaveBeenCalledWith({ token_hash: "tok", type: "recovery" });
    expect(m.setOwnPassword).toHaveBeenCalledWith(expect.anything(), { userId: "u1", password: "goodpass123", clearMustChange: false });
    expect(m.endImpersonation).toHaveBeenCalled();
    expect(m.cookieSet).toHaveBeenCalledWith("creativeos-flash", "password-set", expect.objectContaining({ path: "/", maxAge: 60 }));
    expect(m.redirect).toHaveBeenLastCalledWith("/");
  });

  it("clears a pending must-change flag, since they just chose their own password", async () => {
    m.verifyOtp.mockResolvedValue({ data: { user: { id: "u1", app_metadata: { must_change_password: true } } }, error: null });
    await expect(resetPasswordAction("tok", undefined, passwordForm("goodpass123"))).rejects.toThrow("REDIRECT /");
    expect(m.setOwnPassword).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ clearMustChange: true }));
  });

  it("says the link has expired when the token is refused, and changes nothing", async () => {
    m.verifyOtp.mockResolvedValue({ data: { user: null, session: null }, error: { code: "otp_expired" } });
    expect(await resetPasswordAction("old", undefined, passwordForm("goodpass123"))).toEqual({ expired: true });
    expect(await resetPasswordAction("", undefined, passwordForm("goodpass123"))).toEqual({ expired: true });
    expect(m.setOwnPassword).not.toHaveBeenCalled();
    expect(m.redirect).not.toHaveBeenCalled();
    expect(LINK_EXPIRED).toBe("This link has expired or was already used.");
  });

  it("refuses a mismatch or a short password without using up the link", async () => {
    expect(await resetPasswordAction("tok", undefined, passwordForm("goodpass123", "goodpass124"))).toEqual({ error: "Passwords don't match." });
    expect(await resetPasswordAction("tok", undefined, passwordForm("short1"))).toEqual({ error: "Password must be at least 8 characters." });
    expect(m.verifyOtp).not.toHaveBeenCalled();
  });

  it("hands over to the change-password page when the link worked but the password was refused", async () => {
    m.verifyOtp.mockResolvedValue({ data: { user }, error: null });
    m.setOwnPassword.mockResolvedValueOnce({ error: "Choose a password different from your current one." });
    await expect(resetPasswordAction("tok", undefined, passwordForm("goodpass123"))).rejects.toThrow("REDIRECT /account/password");
    expect(m.setMustChange).toHaveBeenCalledWith("u1", true);
    expect(m.cookieSet).not.toHaveBeenCalled();
  });
});
