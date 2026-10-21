// src/components/nodes/__tests__/version-viewing-ui.test.tsx
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { VersionViewingBar } from "../version-viewing-bar";
import { VersionStepper } from "../version-stepper";
import { VersionOutputEmpty } from "../version-output-empty";
import { ActiveOnlyNotice } from "../active-only-notice";
import { VersionList, arrowKeyTarget } from "../version-list";
import { ImageGenVersionHistory } from "../image-gen-version-history";

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
    expect(html).toMatch(/aria-label="Newer version"[^>]*disabled=""|disabled=""[^>]*aria-label="Newer version"/);
  });
  it("disables Older at the oldest version", () => {
    const html = renderToStaticMarkup(<VersionStepper index={2} total={3} onStep={vi.fn()} />);
    expect(html).toMatch(/aria-label="Older version"[^>]*disabled=""|disabled=""[^>]*aria-label="Older version"/);
    expect(html).not.toMatch(/aria-label="Newer version"[^>]*disabled=""|disabled=""[^>]*aria-label="Newer version"/);
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
  const options = (html: string) => html.match(/<button[^>]*role="option"[^]*?<[/]button>/g) ?? [];
  it("marks the viewed row selected, the active row Active, and never offers Restore", () => {
    const html = renderToStaticMarkup(<VersionList rows={rows} activeVersionId="c" viewedVersionId="a" onView={vi.fn()} />);
    const opts = options(html);
    expect(opts).toHaveLength(3);
    const selected = opts.filter((o) => o.includes('aria-selected="true"'));
    expect(selected).toHaveLength(1);
    expect(text(selected[0])).toContain("v1");
    const active = opts.filter((o) => text(o).includes("Active"));
    expect(active).toHaveLength(1);
    expect(text(active[0])).toContain("v3");
    expect(text(opts.find((o) => text(o).includes("v2"))!)).toContain("Failed");
    expect(opts.filter((o) => o.includes('tabindex="0"'))).toEqual(selected);
    expect(text(html)).not.toContain("Restore");
  });
  it("opens the active row when nothing else is viewed", () => {
    const html = renderToStaticMarkup(<VersionList rows={rows} activeVersionId="c" viewedVersionId={null} onView={vi.fn()} />);
    const selected = options(html).filter((o) => o.includes('aria-selected="true"'));
    expect(selected).toHaveLength(1);
    expect(text(selected[0])).toContain("v3");
  });
  it("makes the first row the tab stop when nothing is open", () => {
    const html = renderToStaticMarkup(<VersionList rows={rows} activeVersionId={null} viewedVersionId={null} onView={vi.fn()} />);
    const opts = options(html);
    expect(opts.filter((o) => o.includes('aria-selected="true"'))).toHaveLength(0);
    const stops = opts.filter((o) => o.includes('tabindex="0"'));
    expect(stops).toHaveLength(1);
    expect(text(stops[0])).toContain("v3");
  });
});

describe("arrowKeyTarget", () => {
  const rows = [{ id: "c" }, { id: "b" }, { id: "a" }];
  it("steps older on ArrowDown and newer on ArrowUp", () => {
    expect(arrowKeyTarget(rows, "b", "ArrowDown")).toBe("a");
    expect(arrowKeyTarget(rows, "b", "ArrowUp")).toBe("c");
  });
  it("returns null at the ends and for other keys", () => {
    expect(arrowKeyTarget(rows, "a", "ArrowDown")).toBeNull();
    expect(arrowKeyTarget(rows, "c", "ArrowUp")).toBeNull();
    expect(arrowKeyTarget(rows, "b", "Enter")).toBeNull();
  });
});

import { VideoGenVersionHistory } from "../video-gen-version-history";

describe("VideoGenVersionHistory", () => {
  it("renders through the shared list with a real-shape video thumb", () => {
    const versions = [
      { id: "b", output: "https://x/b.mp4", error: null, paramsUsed: {}, createdAt: now, modelUsed: "kling:Kling 2.1" },
      { id: "a", output: "https://x/a.mp4", error: null, paramsUsed: {}, createdAt: now, modelUsed: "kling:Kling 2.1" },
    ];
    const html = renderToStaticMarkup(
      <VideoGenVersionHistory versions={versions} activeVersionId="b" viewedVersionId="a" onView={vi.fn()} />,
    );
    expect(html).toContain('role="listbox"');
    expect(html).toContain("h-12 w-auto max-w-20 object-contain");
    expect(text(html)).toContain("Kling 2.1");
    expect(text(html)).not.toContain("Restore");
  });
});

describe("ImageGenVersionHistory", () => {
  it("renders through the shared list with a real-shape image thumb", () => {
    const versions = [
      { id: "b", output: "https://x/b.png", error: null, paramsUsed: { modelId: "openai:GPT Image" }, createdAt: now, decision: null, note: null },
      { id: "a", output: null, error: "x", paramsUsed: {}, createdAt: now, decision: null, note: null },
    ];
    const html = renderToStaticMarkup(
      <ImageGenVersionHistory versions={versions} activeVersionId="b" viewedVersionId={null} onView={vi.fn()} />,
    );
    expect(html).toContain('role="listbox"');
    expect(html).toContain('<img src="https://x/b.png"');
    expect(text(html)).toContain("GPT Image");
    expect(text(html)).toContain("Failed");
  });
});
