import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ComponentProps } from "react";
import { JourneyPanelShell } from "../journey-panel-shell";

// The server render reads each fold memory's fallback, so `foldedByDefault` draws the rail.
const html = (over: Partial<ComponentProps<typeof JourneyPanelShell>> = {}) =>
  renderToStaticMarkup(<JourneyPanelShell foldKey="k" waitingLine={null} {...over}><p>body</p></JourneyPanelShell>);
const section = (out: string) => out.match(/<section[^>]*class="([^"]*)"/)![1].split(" ");

describe("the copilot panel's shell", () => {
  it("puts the whole waiting sentence on the folded rail", () => {
    const out = html({ foldedByDefault: true, waitingLine: "Waiting for the client's review" });
    expect(out).toContain("Waiting for the client&#x27;s review");
    expect(out).not.toContain("Waiting for you: Waiting");
  });

  it("says Copilot on the folded rail when nothing waits", () => {
    expect(html({ foldedByDefault: true })).toContain("[writing-mode:vertical-rl]\">Copilot</span>");
  });

  it("starts open unless told", () => {
    expect(html()).not.toContain('aria-label="Show copilot"');
    expect(html({ foldedByDefault: true })).toContain('aria-label="Show copilot"');
  });

  it("carries a link back when given one", () => {
    const out = html({ back: { label: "Chupps", href: "/clients/chupps/scripts" } });
    expect(out).toMatch(/<a[^>]*href="\/clients\/chupps\/scripts"[^>]*>[\s\S]*Chupps[\s\S]*<\/a>/);
    expect(html()).not.toContain("<a");
  });

  it("is hidden on a narrow screen unless it stacks", () => {
    expect(section(html())).toEqual(expect.arrayContaining(["hidden", "lg:flex"]));
    const stacked = section(html({ narrow: "stacked" }));
    expect(stacked).not.toContain("hidden");
    expect(stacked).toContain("min-h-[32rem]");
  });

  it("sticks under the client frame, or near the top of a page that has none", () => {
    expect(section(html())).toContain("lg:top-20");
    expect(section(html({ placement: "page" }))).toContain("lg:top-6");
  });

  it("refuses to fold while a turn is in flight", () => {
    expect(html({ busy: true })).toMatch(/<button[^>]*aria-label="Hide copilot"[^>]*disabled/);
  });
});
