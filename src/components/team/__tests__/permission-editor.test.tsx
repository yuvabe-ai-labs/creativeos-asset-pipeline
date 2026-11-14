// src/components/team/__tests__/permission-editor.test.tsx
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PermissionEditor } from "../permission-editor";
import { PERMISSION_LABELS } from "@/lib/people/constants";

// renderToStaticMarkup escapes ' as &#x27;; decode it so copy reads as written.
const text = (html: string) =>
  html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim();

describe("PermissionEditor (D509)", () => {
  it("shows a chip with a remove button for each permission, in order", () => {
    const html = renderToStaticMarkup(<PermissionEditor value={["invite", "generate"]} onChange={vi.fn()} personName="Ravi" />);
    expect(text(html)).toMatch(/Generate .*Invite/);
    expect(html).toContain('aria-label="Remove Generate"');
    expect(html).toContain('aria-label="Remove Invite"');
  });

  it("offers the five permissions and nothing else (no View, no Edit)", () => {
    const labels = Object.values(PERMISSION_LABELS);
    expect(labels).toEqual(["Generate", "Approve", "Share", "Delete", "Invite"]);
  });

  it("starts with none, then Choose a permission and Add", () => {
    const html = renderToStaticMarkup(<PermissionEditor value={[]} onChange={vi.fn()} personName="Ravi" />);
    expect(text(html)).toContain("Choose a permission");
    expect(text(html)).toContain("Add");
    expect(html).not.toContain("aria-label=\"Remove");
  });

  it("says where the permissions apply", () => {
    const html = renderToStaticMarkup(<PermissionEditor value={[]} onChange={vi.fn()} personName="Ravi" />);
    expect(text(html)).toContain("These apply on every client Ravi is on, and on any client they're added to later. With none, Ravi can look but not change anything.");
  });

  it("hides the picker once all five are chosen", () => {
    const html = renderToStaticMarkup(
      <PermissionEditor value={["generate", "approve", "share", "delete", "invite"]} onChange={vi.fn()} personName="Ravi" />,
    );
    expect(text(html)).not.toContain("Choose a permission");
  });
});
