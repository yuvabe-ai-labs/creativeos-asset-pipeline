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
    expect(e.text).not.toContain("free credits");
  });

  it("tells the owner about free credits when the agency starts with them", () => {
    const e = ownerInviteEmail({ to: "o@x.com", agency: "Acme", link: "https://app.example/invite/t", freeCredits: { credits: 50000, day: "2026-12-03" } });
    expect(e.text).toContain("You have 50,000 free credits to try CreativeOS until 3 Dec 2026.");
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

  it("lays every email out as a card: heading, message, button, the link written out, footer", () => {
    const e = memberInviteEmail({ to: "p@x.com", agency: "Acme", inviter: "Asha", client: "Chupps", link: "https://app.example/invite/t" });
    expect(e.html).toContain(">Join Acme on CreativeOS</h1>");
    expect(e.html).toContain(">Join Acme</a>");
    expect(e.html).toContain(">The link works for 7 days.</p>");
    expect(e.html).toContain("Or copy this link:");
    expect(e.html.match(/href="https:\/\/app\.example\/invite\/t"/g)).toHaveLength(2);
    expect(e.html).toContain("CreativeOS by Yuvabe Studios.");
    // The hidden preview line inbox apps show next to the subject.
    expect(e.html).toContain("Asha invited you to work on Chupps.");
    expect(e.html.startsWith("<!doctype html>")).toBe(true);
  });

  it("gives each email its own heading", () => {
    const link = "https://app.example/";
    expect(ownerInviteEmail({ to: "o@x.com", agency: "Acme", link }).html).toContain(">Set up Acme</h1>");
    expect(signedUpEmail({ to: ["o@x.com"], name: "Ravi", agency: "Acme", link, forOwner: true }).html).toContain(">Ravi signed up</h1>");
    expect(accessReadyEmail({ to: "p@x.com", agency: "Acme", link }).html).toContain(">You&#39;re in</h1>");
  });

  it("escapes names in the heading, the preview line and the footer too", () => {
    const e = signedUpEmail({ to: ["o@x.com"], name: "<i>R</i>", agency: "A&B", link: "https://app.example/", forOwner: true });
    expect(e.html).not.toContain("<i>R</i>");
    expect(e.html).toContain("&lt;i&gt;R&lt;/i&gt; signed up</h1>");
    expect(e.html).toContain("A&amp;B");
  });

  it("builds links on APP_URL", () => {
    expect(appLink("/team")).toBe("https://app.example/team");
  });
});
