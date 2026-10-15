import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DubbingControls } from "../dubbing-controls";
import { DubbingDubPanel } from "../dubbing-dub-panel";
import { DubbingLipSyncPanel } from "../dubbing-lip-sync-panel";
import { dubCredits, lipSyncCredits } from "@/lib/dubbing/cost";

const base = {
  language: "hi-IN" as const, onLanguageChange: vi.fn(), style: "modern-colloquial" as const, onStyleChange: vi.fn(), sourceSeconds: 8, activeDubSeconds: 8, hasSource: true,
  activeDub: null, running: null, editable: true, onDub: vi.fn(), onLipSync: vi.fn(),
};
const dub = { language: "hi-IN" as const, original: "o", dubbed: "d", dubbedAudio: "a", lipSynced: null };

// The repo has no DOM test environment, so these render to static markup (as the other
// component tests do) and read each button's label and disabled state.
function buttons(html: string): { text: string; disabled: boolean }[] {
  return [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)]
    .map((m) => ({ text: m[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim(), disabled: /\sdisabled(=|\s|$)/.test(m[1]) }))
    .filter((b) => /Dub|Lip|Go to/.test(b.text));
}
const find = (html: string, re: RegExp) => buttons(html).find((b) => re.test(b.text));

// Each tab's panel, rendered on its own (static markup shows only the active tab of the shell).
const dubPanel = (over: Partial<Parameters<typeof DubbingDubPanel>[0]> = {}) =>
  renderToStaticMarkup(<DubbingDubPanel {...base} sourceLoading={false} hasDub={false} {...over} />);
const lipPanel = (over: Partial<Parameters<typeof DubbingLipSyncPanel>[0]> = {}) =>
  renderToStaticMarkup(<DubbingLipSyncPanel activeDub={dub} activeDubSeconds={8} running={null} editable onLipSync={vi.fn()} {...over} />);

describe("DubbingControls (tabs)", () => {
  it("shows Dub and Lip sync as tabs, opening on Dub", () => {
    const html = renderToStaticMarkup(<DubbingControls {...base} />);
    expect(html).toMatch(/role="tab"[^>]*>Dub</);
    expect(html).toContain("Lip sync");
    expect(html).toContain("Translation style");
  });

  it("keeps the Lip sync tab disabled until there is a dub, with no Ready mark", () => {
    // The Lip sync tab element's own attributes, read off the static markup.
    const lipTabDisabled = (html: string) => {
      const attrs = /<button([^>]*)>Lip sync</.exec(html)?.[1] ?? "";
      return /sdisabled(=|s|$)|aria-disabled="true"|sdata-disabled(=|s|$)/.test(attrs);
    };
    expect(lipTabDisabled(renderToStaticMarkup(<DubbingControls {...base} />))).toBe(true);
    const withDub = renderToStaticMarkup(<DubbingControls {...base} activeDub={dub} />);
    expect(lipTabDisabled(withDub)).toBe(false);
    expect(withDub).not.toContain("Ready");
  });

  it("opens on Lip sync while one is running", () => {
    const html = renderToStaticMarkup(<DubbingControls {...base} activeDub={dub} running="lipsync" />);
    expect(find(html, /Lip-syncing…/)?.disabled).toBe(true);
  });
});

describe("Dub tab", () => {
  it("shows the translation style in plain words, with what it means", () => {
    const html = dubPanel({ style: "formal" });
    expect(html).toContain("About translation style");
    expect(html).toContain("Formal");
    expect(html).toContain("Polished and respectful, no slang.");
  });

  it("shows Dub with its credit estimate, and Dub again once a dub exists", () => {
    const dubBtn = find(dubPanel(), /^Dub/);
    expect(dubBtn?.text).toContain(`Est. ${dubCredits(8)} credits`);
    expect(dubBtn?.disabled).toBe(false);
    expect(find(dubPanel({ hasDub: true }), /^Dub again/)).toBeTruthy();
  });

  it("explains an unpriced take instead of leaving Dub silently off", () => {
    const html = dubPanel({ sourceSeconds: 0 });
    expect(html).toContain("This take has no recorded length, so it can&#x27;t be priced.");
    expect(find(html, /^Dub/)?.disabled).toBe(true);
    expect(dubPanel({ sourceSeconds: 0, sourceLoading: true })).not.toContain("no recorded length");
  });

  it("asks for a video when nothing is connected, and blocks while busy or read-only", () => {
    expect(dubPanel({ hasSource: false })).toContain("Connect a video to dub.");
    expect(find(dubPanel({ hasSource: false }), /^Dub/)?.disabled).toBe(true);
    expect(find(dubPanel({ running: "dub" }), /Dubbing…/)?.disabled).toBe(true);
    expect(find(dubPanel({ editable: false }), /^Dub/)?.disabled).toBe(true);
  });
});

describe("Lip sync tab", () => {
  it("names the dub's language and prices on the dub's own length", () => {
    const html = lipPanel({ activeDubSeconds: 5 });
    expect(html).toContain("Match the mouth to the Hindi dub");
    const btn = find(html, /^Lip sync/);
    expect(btn?.text).toContain(`Est. ${lipSyncCredits(5)} credits`);
    expect(btn?.disabled).toBe(false);
  });

  it("offers Lip sync again on a lip-synced dub, and blocks when unpriced, busy or read-only", () => {
    expect(find(lipPanel({ activeDub: { ...dub, lipSynced: "l" } }), /^Lip sync again/)).toBeTruthy();
    expect(find(lipPanel({ activeDubSeconds: 0 }), /^Lip sync/)?.disabled).toBe(true);
    expect(find(lipPanel({ running: "dub" }), /^Lip sync/)?.disabled).toBe(true);
    expect(find(lipPanel({ editable: false }), /^Lip sync/)?.disabled).toBe(true);
  });
});
