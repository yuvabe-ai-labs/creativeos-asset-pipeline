import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({
  generateLink: vi.fn(),
  sendEmail: vi.fn(async () => ({ sent: true })),
}));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: () => ({ auth: { admin: { generateLink: m.generateLink } } }) }));
vi.mock("@/lib/email/send", () => ({ sendEmail: m.sendEmail }));

import { resetLink, sendPasswordResetLink } from "./password-reset";

const TOKEN = "secret-hashed-token";

describe("sendPasswordResetLink (D598)", () => {
  beforeEach(() => {
    process.env.APP_URL = "https://app.example/";
    m.generateLink.mockReset();
    m.sendEmail.mockClear();
  });

  it("emails our own reset page with the hashed token, never the sign-in service's link", async () => {
    m.generateLink.mockResolvedValue({ data: { properties: { hashed_token: TOKEN, action_link: "https://auth.example/verify?token=x" } }, error: null });
    await sendPasswordResetLink("asha@example.com");
    expect(m.generateLink).toHaveBeenCalledWith({ type: "recovery", email: "asha@example.com" });
    const [email] = m.sendEmail.mock.calls[0] as unknown as [{ to: string[]; subject: string; text: string }];
    expect(email.to).toEqual(["asha@example.com"]);
    expect(email.subject).toBe("Set a new password for CreativeOS");
    expect(email.text).toContain(`https://app.example/login/reset?token_hash=${TOKEN}`);
    expect(email.text).not.toContain("auth.example");
  });

  it("sends nothing when no account has the email", async () => {
    m.generateLink.mockResolvedValue({ data: { properties: null, user: null }, error: { status: 404, code: "user_not_found", message: "User not found" } });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await sendPasswordResetLink("nobody@example.com");
    expect(m.sendEmail).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it("never throws, and never logs the email or the token", async () => {
    m.generateLink.mockResolvedValue({ data: { properties: { hashed_token: TOKEN } }, error: null });
    m.sendEmail.mockRejectedValueOnce(new Error(`boom ${TOKEN} asha@example.com`));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(sendPasswordResetLink("asha@example.com")).resolves.toBeUndefined();
    const logged = JSON.stringify(log.mock.calls);
    expect(logged).not.toContain(TOKEN);
    expect(logged).not.toContain("asha@example.com");
    log.mockRestore();
  });

  it("escapes the token into the link", () => {
    expect(resetLink("a+b/c=")).toBe("https://app.example/login/reset?token_hash=a%2Bb%2Fc%3D");
  });
});
