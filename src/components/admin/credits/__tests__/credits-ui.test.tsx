import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {}, replace: () => {} }), usePathname: () => "/admin/credits" }));
vi.mock("@/lib/actions/credit-settings", () => ({}));
import { seededModelCatalog } from "@/lib/ai-models/test-catalog";
import { buildCreditReview, defaultCreditWhen } from "@/lib/admin/credits-change";
import { creditHistory, creditRunRows, typicalCreditRuns } from "@/lib/admin/credits-page";
import { exampleRuns, nextCreditChange, nowRow } from "@/lib/admin/credits-overview";
import { CreditsCard } from "../credits-card";
import { CreditSettingsStep } from "../credit-settings-step";
import { CreditHistory } from "../credit-history";
import { NextChangeRow } from "../next-change-row";
import { CreditReviewStep } from "../credit-review-step";
import { CreditsWorkspace } from "../credits-workspace";
import { WorkedExample } from "../worked-example";

const NOW = new Date("2026-11-24T06:30:00Z");
const ZERO = { marginPercent: 0, roundStep: 5 as const };
const LIVE_ROW = { id: "a", effectiveFrom: "2026-01-01T00:00:00Z", marginPercent: 0, roundStep: 5 as const, note: null };
const runs = typicalCreditRuns(seededModelCatalog(), NOW);
const text = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&#x27;/g, "'").replace(/&amp;/g, "&");

const SCHEDULED = { ...LIVE_ROW, id: "n", effectiveFrom: "2026-12-01T18:30:00Z", marginPercent: 10 };
const emptyHistory = { timeline: { items: [], source: null }, kept: {} };

describe("settings card", () => {
  it("shows Now, no change scheduled, the fixed rate and two closed disclosures", () => {
    const t = text(renderToStaticMarkup(<CreditsCard now={nowRow(LIVE_ROW)} live={ZERO} next={null} history={emptyHistory} />));
    expect(t).toContain("Margin 0% · rounds up to the next 5 credits");
    expect(t).toContain("Since 1 Jan 2026");
    expect(t).toContain("No change scheduled.");
    expect(t).toContain("1 credit is $0.001 of what we pay, always.");
    const html = renderToStaticMarkup(<CreditsCard now={nowRow(LIVE_ROW)} live={ZERO} next={null} history={emptyHistory} />);
    expect(html.match(/aria-expanded="false"/g)).toHaveLength(2);
    expect(t).toContain("How credits are worked out");
    expect(t).toContain("History");
  });
  it("the Next row says the change, a typical run, held credits and offers Cancel", () => {
    const next = nextCreditChange({ settings: [LIVE_ROW, SCHEDULED], now: NOW, reference: { name: "Kling 3.0", usd: 0.62, flat: null }, runs, agencyRuns: [], modelRuns: {} });
    const t = text(renderToStaticMarkup(<NextChangeRow next={next} />));
    expect(t).toContain("From 2 Dec 2026, 00:00 IST");
    expect(t).toContain("Margin 0% → 10%.");
    expect(t).toContain("A typical Kling 3.0 run goes from 620 to 685 credits.");
    expect(t).toMatch(/Credits agencies hold buy about \d+% fewer runs\./);
    expect(t).toContain("Cancel");
  });
});

describe("worked example", () => {
  it("uses the simple $0.0123 run at the settings given", () => {
    const t = text(renderToStaticMarkup(<WorkedExample settings={ZERO} />));
    expect(t).toContain("A run that costs us $0.0123 is 12.3 credits, which rounds up to 15.");
    expect(t).not.toContain("margin");
    const m = text(renderToStaticMarkup(<WorkedExample settings={{ marginPercent: 10, roundStep: 1 }} live={ZERO} />));
    expect(m).toContain("+ 10% margin");
    expect(m).toContain("credits charged, was 15");
  });
});

describe("settings step", () => {
  it("edits margin and step, shows three example runs, and flags a margin to fix", () => {
    const examples = creditRunRows(exampleRuns(runs), ZERO, { marginPercent: 10, roundStep: 10 });
    const ok = text(renderToStaticMarkup(<CreditSettingsStep margin="10" step={10} invalid={false} examples={examples} filledIn={null} onMargin={() => {}} onStep={() => {}} />));
    for (const t of ["Margin", "Round up to", "1 credit", "5 credits", "10 credits", "What this does", "→"]) expect(ok).toContain(t);
    expect(examples).toHaveLength(3);
    const bad = renderToStaticMarkup(<CreditSettingsStep margin="250" step={5} invalid examples={[]} filledIn="the 2 Dec change" onMargin={() => {}} onStep={() => {}} />);
    expect(bad).toContain('aria-invalid="true"');
    expect(text(bad)).toContain("Use a number from 0 to 200");
    expect(text(bad)).toContain("The 2 Dec change is filled in. Saving on that day replaces it.");
  });
});

describe("review", () => {
  it("lists the warnings, the runs, the agencies and what held credits buy", () => {
    const review = buildCreditReview({
      settings: [LIVE_ROW],
      draft: { marginPercent: 100, roundStep: 5 },
      when: defaultCreditWhen(NOW),
      now: NOW,
      runs,
      agencyRuns: [{ modelId: "m", orgId: "o", orgName: "Acme", runs: 3 }],
      modelRuns: { m: { usd: 0.0123, flat: null } },
    });
    const t = text(renderToStaticMarkup(<CreditReviewStep review={review} />));
    expect(t).toContain("Margin 0% → 100%, from 25 Nov 2026, 00:00 IST, tomorrow.");
    expect(t).toContain("A 100% margin puts every run up by at least that much. Check that's what you meant.");
    expect(t).toContain("The one agency with runs this month would have used about 67% more credits for the same work.");
    expect(t).toContain("Credits agencies hold buy about 40% fewer runs.");
    // No full table in review: only what the decision needs.
    expect(t).not.toContain("Every model and agency");
  });
});

describe("review over a scheduled change", () => {
  it("lists what the change held and what replaces it, and the button says so", () => {
    const scheduled = { ...LIVE_ROW, id: "s", effectiveFrom: "2026-11-25T04:30:00Z", marginPercent: 10, roundStep: 10 as const };
    const review = buildCreditReview({ settings: [LIVE_ROW, scheduled], draft: { marginPercent: 20, roundStep: 10 }, when: defaultCreditWhen(NOW), now: NOW, runs, agencyRuns: [], modelRuns: {} });
    const t = text(renderToStaticMarkup(<CreditReviewStep review={review} />));
    expect(t).toContain("This replaces the change scheduled for 25 Nov 2026, 10:00 IST (margin 10%, rounding step 10 credits).");
    expect(review.confirm).toBe("Replace the 25 Nov change");
  });
});

describe("history and page", () => {
  it("shows the settings history with Cancel on a scheduled change", () => {
    const rows = [
      { id: "a", effectiveFrom: LIVE_ROW.effectiveFrom, createdAt: "2026-01-01T00:00:00Z", createdBy: null, createdByName: null, settings: LIVE_ROW, problems: [] },
      { id: "n", effectiveFrom: "2026-11-24T18:30:00Z", createdAt: "2026-11-24T06:00:00Z", createdBy: "u1", createdByName: "Arun", settings: { ...LIVE_ROW, id: "n", effectiveFrom: "2026-11-24T18:30:00Z", marginPercent: 10 }, problems: [] },
    ];
    const t = text(renderToStaticMarkup(<CreditHistory timeline={creditHistory(rows, { now: NOW, callerId: "u1" })} kept={{}} />));
    expect(t).toContain("From 25 Nov 2026, 00:00 IST");
    expect(t).toContain("Margin 0% → 10%");
    expect(t).toContain("Cancel this change");
    expect(t).toContain("Live now");
  });
  it("the workspace shows the title, its one action and the card, with the flow closed", () => {
    const html = renderToStaticMarkup(
      <CreditsWorkspace
        now={nowRow(LIVE_ROW)}
        next={null}
        history={emptyHistory}
        live={ZERO}
        settings={[LIVE_ROW]}
        starts={[{ id: LIVE_ROW.id, effectiveFrom: LIVE_ROW.effectiveFrom }]}
        runs={runs}
        agencyRuns={[]}
        modelRuns={{}}
      />,
    );
    expect(text(html)).toContain("What runs cost agencies in credits. One setting for every agency.");
    expect(html).toContain('id="credits-change-start"');
    expect(text(html)).toContain("No change scheduled.");
    expect(text(html)).not.toContain("What this does");
  });
});
