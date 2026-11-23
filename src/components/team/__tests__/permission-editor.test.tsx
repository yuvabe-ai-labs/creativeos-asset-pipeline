// src/components/team/__tests__/permission-editor.test.tsx
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup, renderToString } from "react-dom/server";
import { PermissionEditor } from "../permission-editor";
import { PERMISSION_HINTS, PERMISSION_LABELS } from "@/lib/people/constants";

// renderToStaticMarkup escapes ' as &#x27;; decode it so copy reads as written.
const text = (html: string) =>
  html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim();

const pressed = (html: string) =>
  [...html.matchAll(/<button[^>]*aria-label="([^"]+)"[^>]*>/g)]
    .filter((m) => m[0].includes("aria-pressed=\"true\""))
    .map((m) => m[1]);

describe("PermissionEditor (D547)", () => {
  it("shows all five permissions as toggles, in order, each with its hint", () => {
    const html = renderToStaticMarkup(<PermissionEditor value={[]} onChange={vi.fn()} personName="Ravi" />);
    expect(text(html)).toMatch(/Generate .*Approve .*Share .*Delete .*Invite/);
    for (const hint of Object.values(PERMISSION_HINTS)) expect(text(html)).toContain(hint);
    expect(html).not.toContain("Choose a permission");
  });

  it("offers the five permissions and nothing else (no View, no Edit)", () => {
    expect(Object.values(PERMISSION_LABELS)).toEqual(["Generate", "Approve", "Share", "Delete", "Invite"]);
  });

  it("marks exactly the held permissions as on", () => {
    const html = renderToStaticMarkup(<PermissionEditor value={["invite", "generate"]} onChange={vi.fn()} personName="Ravi" />);
    expect(pressed(html)).toEqual(["Generate", "Invite"]);
  });

  it("starts with none on", () => {
    const html = renderToStaticMarkup(<PermissionEditor value={[]} onChange={vi.fn()} personName="Ravi" />);
    expect(pressed(html)).toEqual([]);
  });

  it("says where the permissions apply", () => {
    const html = renderToStaticMarkup(<PermissionEditor value={[]} onChange={vi.fn()} personName="Ravi" />);
    expect(text(html)).toContain("These apply on every client Ravi is on, and on any client they're added to later. With none, Ravi can look but not change anything.");
  });

  // renderToString marks text-node boundaries with <!-- -->; the note must be one run, or a reader
  // of the accessibility tree sees "With none,Ravi can look".
  it("writes the note as one run of text, with its spaces", () => {
    const html = renderToString(<PermissionEditor value={[]} onChange={vi.fn()} personName="Test Member" />);
    expect(html).toContain(
      "These apply on every client Test Member is on, and on any client they&#x27;re added to later. With none, Test Member can look but not change anything.",
    );
  });
});
