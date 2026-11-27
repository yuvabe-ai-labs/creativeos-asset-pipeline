// src/app/admin/orgs/[id]/__tests__/org-detail-url.test.tsx
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { orgTabFrom } from "../org-tabs";

const read = (p: string) => readFileSync(p, "utf8");

describe("admin agency page: the tab lives in the URL (Task 13 review)", () => {
  it("takes the tab from ?tab, falling back to Overview for anything unknown", () => {
    expect(orgTabFrom("people")).toBe("people");
    expect(orgTabFrom("support")).toBe("support");
    expect(orgTabFrom("nonsense")).toBe("overview");
    expect(orgTabFrom(null)).toBe("overview");
  });

  it("reads the tab and person from the URL and changes it without remounting or a server round trip", () => {
    const tabs = read("src/app/admin/orgs/[id]/org-detail-tabs.tsx");
    expect(tabs).toContain("useSearchParams");
    expect(tabs).toContain("orgTabFrom(");
    expect(tabs).not.toContain("initialTab");
    const page = read("src/app/admin/orgs/[id]/page.tsx");
    expect(page).not.toMatch(/key=\{`\$\{tab/);
    expect(page).not.toContain("searchParams");
  });

  it("pushes a history entry per tab switch, so Back returns to the previous tab", () => {
    const tabs = read("src/app/admin/orgs/[id]/org-detail-tabs.tsx");
    expect(tabs).toContain("window.history.pushState(null, \"\", orgTabUrl(");
    expect(tabs).not.toContain("replaceState");
  });

  it("opens a client in the Clients tab from the URL with a history entry, and offers All clients back", () => {
    const clients = read("src/app/admin/orgs/[id]/admin-clients-tab.tsx");
    expect(clients).toContain('searchParams.get("client")');
    expect(clients).toContain("window.history.pushState(");
    expect(clients).not.toContain("useState");
    expect(clients).toContain("adminClientCrumbs(orgId, open)");
  });

  it("has no breadcrumb under the admin tabs: the Agencies tab is the way back", () => {
    const page = read("src/app/admin/orgs/[id]/page.tsx");
    expect(page).not.toContain("breadcrumb=");
    expect(read("src/app/admin/models/[id]/page.tsx")).not.toContain("<Breadcrumb");
  });

  it("keeps the Overview People count on the shared people read", () => {
    const tabs = read("src/app/admin/orgs/[id]/org-detail-tabs.tsx");
    expect(tabs).toContain("usePeople(org.id");
    expect(tabs).not.toContain("String(people.length)");
  });

  it("doesn't remount the client's Members on each client click; the chosen client isn't a primary fill", () => {
    const clients = read("src/app/admin/orgs/[id]/admin-clients-tab.tsx");
    expect(clients).not.toMatch(/<ClientMembers[^>]*key=/s);
    expect(clients).not.toContain('"default"');
  });

  it("Make owner shows a server message only for an API error", () => {
    const dialog = read("src/components/team/make-owner-dialog.tsx");
    expect(dialog).toContain("e instanceof ApiError");
    expect(dialog).not.toContain("e instanceof Error ?");
  });
});
