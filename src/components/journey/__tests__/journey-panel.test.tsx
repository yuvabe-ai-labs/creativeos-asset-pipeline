import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { guideFor } from "@/lib/journey/guide";
import type { JourneyState } from "@/lib/journey/stages";
import { JourneyPanel } from "../journey-panel";

// The real button needs the router and the query client; this test is about whether the guide offers it.
vi.mock("@/components/scripts/new-script-button", () => ({
  NewScriptButton: ({ label }: { label: string }) => <span data-new-script>{label}</span>,
}));

const open: JourneyState = { kb: "approved", market: "approved", scripts: "open" };
const locked: JourneyState = { kb: "approved", market: "in_progress", scripts: "locked" };
const html = (section: "market" | "scripts", state: JourneyState) =>
  renderToStaticMarkup(<JourneyPanel clientId="c1" slug="chupps" guide={guideFor({ section, state, slug: "chupps" })} />);

describe("the Scripts guide", () => {
  it("offers to start a script while scripts are open", () => {
    expect(html("scripts", open)).toContain("<span data-new-script=\"true\">Start a script</span>");
  });
  it("offers to paste one while they are locked, beside the way to market research", () => {
    const out = html("scripts", locked);
    expect(out).toContain("<span data-new-script=\"true\">Paste a script</span>");
    expect(out).toContain("Go to market research");
  });
  it("offers nothing of the kind on market research", () => {
    expect(html("market", locked)).not.toContain("data-new-script");
  });
});
