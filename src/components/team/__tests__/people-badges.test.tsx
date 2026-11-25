import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StatusBadge, type PeopleStatus } from "../status-badge";
import { PermissionSummary } from "../permission-summary";

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

describe("StatusBadge", () => {
  const cases: [PeopleStatus, string, RegExp][] = [
    ["owner", "Owner", /text-primary/],
    ["member", "Member", /text-foreground\/80/],
    ["signed_up", "Signed up · Needs permissions", /text-warning-text/],
    ["invited", "Invited", /border-dashed/],
  ];

  it.each(cases)("gives %s its own look and label, with a dot", (status, label, look) => {
    const html = renderToStaticMarkup(<StatusBadge status={status} />);
    expect(text(html)).toBe(label);
    expect(html).toMatch(look);
    expect(html).toContain('aria-hidden="true"');
  });

  it("uses the warning token for someone waiting, never a hard-coded colour", () => {
    const html = renderToStaticMarkup(<StatusBadge status="signed_up" />);
    expect(html).toContain("bg-warning");
    expect(html).not.toMatch(/#[0-9a-f]{3,6}|amber-/i);
  });
});

describe("PermissionSummary", () => {
  it("lists permissions in the PERMISSIONS order, whatever order they come in", () => {
    expect(text(renderToStaticMarkup(<PermissionSummary permissions={["invite", "generate", "share"]} />))).toBe("Generate Share Invite");
  });

  it("says Can look for none, and Everything for the owner", () => {
    expect(text(renderToStaticMarkup(<PermissionSummary permissions={[]} />))).toBe("Can look");
    expect(text(renderToStaticMarkup(<PermissionSummary permissions={[]} owner />))).toBe("Everything");
  });
});
