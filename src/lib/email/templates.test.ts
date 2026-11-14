import { describe, it, expect, beforeEach } from "vitest";
import { accessReadyEmail, appLink, memberInviteEmail, ownerInviteEmail, signedUpEmail } from "./templates";

describe("emails (spec §6.3, §6.7)", () => {
  beforeEach(() => { process.env.APP_URL = "https://app.example/"; });

  it("invites a member to work on a client", () => {
    const e = memberInviteEmail({ to: "p@x.com", agency: "Acme", inviter: "Asha", client: "Chupps", link: "https://app.example/invite/t" });
    expect(e.subject).toBe("You're invited to Acme");
    expect(e.text).toContain("Asha has invited you to join Acme on CreativeOS, to work on Chupps.");
    expect(e.text).toContain("Join Acme: https://app.example/invite/t");
    expect(e.html).toContain('href="https://app.example/invite/t"');
    expect(e.to).toEqual(["p@x.com"]);
  });

  it("invites an owner to set up the agency", () => {
    const e = ownerInviteEmail({ to: "o@x.com", agency: "Acme", link: "https://app.example/invite/t" });
    expect(e.subject).toBe("Set up Acme on CreativeOS");
  });

  it("tells the owner someone signed up, with the Team page line", () => {
    const e = signedUpEmail({ to: ["o@x.com"], name: "Ravi", agency: "Acme", link: "https://app.example/team", forOwner: true });
    expect(e.subject).toBe("Ravi signed up to Acme");
    expect(e.text).toContain("Ravi signed up to Acme. Give them permissions on the Team page.");
  });

  it("tells the inviter someone signed up, without the Team page line", () => {
    const e = signedUpEmail({ to: ["i@x.com"], name: "Ravi", agency: "Acme", link: "https://app.example/", forOwner: false });
    expect(e.subject).toBe("Ravi signed up to Acme");
    expect(e.text).toContain("Ravi signed up to Acme.");
    expect(e.text).not.toContain("Team page");
  });

  it("tells the person their access is ready", () => {
    expect(accessReadyEmail({ to: "p@x.com", agency: "Acme", link: "https://app.example/" }).subject).toBe("Your access to Acme is ready");
  });

  it("escapes what people typed in the html", () => {
    const e = memberInviteEmail({ to: "p@x.com", agency: "<b>Acme</b>", inviter: "A", client: "C", link: "https://app.example/invite/t" });
    expect(e.html).not.toContain("<b>Acme</b>");
    expect(e.html).toContain("&lt;b&gt;Acme&lt;/b&gt;");
  });

  it("builds links on APP_URL", () => {
    expect(appLink("/team")).toBe("https://app.example/team");
  });
});
