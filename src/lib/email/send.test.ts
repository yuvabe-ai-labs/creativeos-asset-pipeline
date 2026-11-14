import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

import { sendEmail } from "./send";

const email = { to: ["a@example.com"], subject: "Hi", text: "Hello", html: "<p>Hello</p>" };

describe("sendEmail", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "CreativeOS <hello@example.com>";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;
  });

  it("sends nothing, and says so, without the key or the sender", async () => {
    delete process.env.RESEND_API_KEY;
    expect(await sendEmail(email)).toEqual({ sent: false, reason: "not_configured" });
    process.env.RESEND_API_KEY = "re_test";
    delete process.env.EMAIL_FROM;
    expect(await sendEmail(email)).toEqual({ sent: false, reason: "not_configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts the email with the key", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: "e1" }), { status: 200 }));
    expect(await sendEmail(email)).toEqual({ sent: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers.Authorization).toBe("Bearer re_test");
    expect(JSON.parse(init.body)).toEqual({ from: "CreativeOS <hello@example.com>", to: ["a@example.com"], subject: "Hi", text: "Hello", html: "<p>Hello</p>" });
  });

  it("reports a refused or failed send as failed, never throwing", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockResolvedValueOnce(new Response("nope", { status: 422 }));
    expect(await sendEmail(email)).toEqual({ sent: false, reason: "failed" });
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    expect(await sendEmail(email)).toEqual({ sent: false, reason: "failed" });
    err.mockRestore();
  });
});
