import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DubbingControls } from "../dubbing-controls";
import { dubCredits, lipSyncCredits } from "@/lib/dubbing/cost";

const base = {
  language: "hi-IN" as const, onLanguageChange: vi.fn(), sourceSeconds: 8, hasSource: true,
  activeDub: null, running: null, editable: true, onDub: vi.fn(), onLipSync: vi.fn(),
};
const dub = { language: "hi-IN" as const, original: "o", dubbed: "d", dubbedAudio: "a", lipSynced: null };

// The repo has no DOM test environment, so these render to static markup (as the other
// component tests do) and read each button's label and disabled state.
function buttons(html: string): { text: string; disabled: boolean }[] {
  return [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)]
    .map((m) => ({ text: m[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim(), disabled: /\sdisabled(=|\s|$)/.test(m[1]) }))
    .filter((b) => /Dub|Lip/.test(b.text));
}
const find = (html: string, re: RegExp) => buttons(html).find((b) => re.test(b.text));

describe("DubbingControls", () => {
  it("shows Dub with its credit estimate and keeps Lip sync off until a dub exists", () => {
    const html = renderToStaticMarkup(<DubbingControls {...base} />);
    const dubBtn = find(html, /^Dub/);
    expect(dubBtn?.text).toContain(`Est. ${dubCredits(8)} credits`);
    expect(dubBtn?.disabled).toBe(false);
    expect(find(html, /^Lip sync/)?.disabled).toBe(true);
  });

  it("enables Lip sync on a dub, with its estimate", () => {
    const html = renderToStaticMarkup(<DubbingControls {...base} activeDub={dub} />);
    const btn = find(html, /^Lip sync/);
    expect(btn?.text).toContain(`Est. ${lipSyncCredits(8)} credits`);
    expect(btn?.disabled).toBe(false);
    expect(find(html, /^Dub again/)).toBeTruthy();
  });

  it("says what is running and blocks both buttons", () => {
    const html = renderToStaticMarkup(<DubbingControls {...base} activeDub={dub} running="dub" />);
    expect(find(html, /Dubbing…/)?.disabled).toBe(true);
    expect(find(html, /^Lip sync/)?.disabled).toBe(true);
  });

  it("asks for a video when nothing is connected", () => {
    const html = renderToStaticMarkup(<DubbingControls {...base} hasSource={false} />);
    expect(html).toContain("Connect a video to dub.");
    expect(find(html, /^Dub/)?.disabled).toBe(true);
  });

  it("blocks both buttons when the view is read-only", () => {
    const html = renderToStaticMarkup(<DubbingControls {...base} activeDub={dub} editable={false} />);
    expect(find(html, /^Dub again/)?.disabled).toBe(true);
    expect(find(html, /^Lip sync/)?.disabled).toBe(true);
  });
});
