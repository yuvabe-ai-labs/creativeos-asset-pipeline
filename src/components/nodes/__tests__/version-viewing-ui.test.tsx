// src/components/nodes/__tests__/version-viewing-ui.test.tsx
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { VersionViewingBar } from "../version-viewing-bar";
import { VersionStepper } from "../version-stepper";
import { VersionOutputEmpty } from "../version-output-empty";
import { ActiveOnlyNotice } from "../active-only-notice";
import { VersionList } from "../version-list";

// No DOM environment in this repo: render to static markup and read text and attributes.
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const now = new Date().toISOString();

describe("VersionViewingBar", () => {
  const base = { viewedLabel: "v3", viewedCreatedAt: now, activeLabel: "v6", canRestore: true, restoring: false, onBack: vi.fn(), onRestore: vi.fn() };
  it("names the viewed and the active version, with Back and Restore", () => {
    const t = text(renderToStaticMarkup(<VersionViewingBar {...base} />));
    expect(t).toContain("Viewing v3, made just now. The node still uses v6.");
    expect(t).toContain("Back to v6");
    expect(t).toContain("Restore v3");
  });
  it("hides Restore for a version that cannot be restored", () => {
    expect(text(renderToStaticMarkup(<VersionViewingBar {...base} canRestore={false} />))).not.toContain("Restore");
  });
  it("says only Back when the node has no active version", () => {
    const t = text(renderToStaticMarkup(<VersionViewingBar {...base} activeLabel={null} />));
    expect(t).not.toContain("still uses");
    expect(t).toContain("Back");
  });
});

describe("VersionStepper", () => {
  it("labels the position and disables the ends", () => {
    const html = renderToStaticMarkup(<VersionStepper index={0} total={3} onStep={vi.fn()} />);
    expect(text(html)).toContain("v3 of 3");
    expect(html).toMatch(/aria-label="Newer version"[^>]*disabled|disabled[^>]*aria-label="Newer version"/);
  });
  it("renders nothing with no versions", () => {
    expect(renderToStaticMarkup(<VersionStepper index={-1} total={0} onStep={vi.fn()} />)).toBe("");
  });
});

describe("VersionOutputEmpty and ActiveOnlyNotice", () => {
  it("use the agreed copy", () => {
    expect(text(renderToStaticMarkup(<VersionOutputEmpty noun="video" />))).toContain("No video from this attempt");
    expect(text(renderToStaticMarkup(<ActiveOnlyNotice label="v3" />))).toBe("You&#x27;re viewing v3. Restore it to review or change it.");
  });
});

describe("VersionList", () => {
  const rows = [
    { id: "c", createdAt: now, error: null, summary: "Kling 2.1" },
    { id: "b", createdAt: now, error: "boom" },
    { id: "a", createdAt: now, error: null },
  ];
  it("marks the viewed row selected, the active row Active, and never offers Restore", () => {
    const html = renderToStaticMarkup(<VersionList rows={rows} activeVersionId="c" viewedVersionId="a" onView={vi.fn()} />);
    expect(html).toMatch(/aria-selected="true"[^>]*>[\s\S]*?v1/);
    expect(text(html)).toContain("Active");
    expect(text(html)).toContain("Failed");
    expect(text(html)).not.toContain("Restore");
  });
  it("opens the active row when nothing else is viewed", () => {
    const html = renderToStaticMarkup(<VersionList rows={rows} activeVersionId="c" viewedVersionId={null} onView={vi.fn()} />);
    expect((html.match(/aria-selected="true"/g) ?? []).length).toBe(1);
  });
});
