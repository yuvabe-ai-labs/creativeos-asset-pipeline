import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LinkSentNotice, linkSentCopy } from "../link-sent-notice";
import { CopyRow } from "../copy-row";

describe("LinkSentNotice", () => {
  it("says the invite was emailed, or that the link has to be sent by hand", () => {
    expect(linkSentCopy(true, "a@x.com").title).toBe("Invite sent to a@x.com");
    expect(linkSentCopy(false, "a@x.com")).toEqual({
      title: "Invite ready for a@x.com",
      body: "We couldn't email it from here, so copy the link and send it to them yourself.",
    });
  });

  it("shows the link to copy and the note", () => {
    const html = renderToStaticMarkup(
      <LinkSentNotice emailed={false} email="a@x.com" label="Invite link" link="https://app/invite/abc" note="Then set their permissions." />,
    );
    expect(html).toContain("https://app/invite/abc");
    expect(html).toContain("Then set their permissions.");
    expect(html).toContain('aria-label="Copy invite link"');
  });
});

describe("CopyRow", () => {
  // A long link with no spaces must not set the row's width inside a dialog's grid.
  it("can shrink below its content and truncates the value", () => {
    const html = renderToStaticMarkup(<CopyRow label="Invite link" value={`https://app/invite/${"x".repeat(80)}`} />);
    expect(html).toMatch(/class="[^"]*\bw-full\b[^"]*\bmin-w-0\b/);
    expect(html).toMatch(/class="[^"]*\btruncate\b/);
  });
});
