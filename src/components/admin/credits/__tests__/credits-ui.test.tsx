import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {}, replace: () => {} }), usePathname: () => "/admin/credits" }));
vi.mock("@/lib/actions/credit-settings", () => ({}));
import { seededModelCatalog } from "@/lib/ai-models/test-catalog";
import { buildCreditReview, defaultCreditWhen } from "@/lib/admin/credits-change";
import { creditHistory, creditRunRows, creditsSummary, typicalCreditRuns } from "@/lib/admin/credits-page";
import { CreditsSummary } from "../credits-summary";
import { CreditSettingsCard } from "../credit-settings-card";
import { CreditEditBar } from "../credit-edit-bar";
import { CreditHistory } from "../credit-history";
import { CreditReviewStep } from "../credit-review-step";
import { CreditsWorkspace } from "../credits-workspace";
import { TypicalRunsTable } from "../typical-runs-table";
import { WorkedExample } from "../worked-example";

const NOW = new Date("2026-11-24T06:30:00Z");
const ZERO = { marginPercent: 0, roundStep: 5 as const };
const LIVE_ROW = { id: "a", effectiveFrom: "2026-01-01T00:00:00Z", marginPercent: 0, roundStep: 5 as const, note: null };
const runs = typicalCreditRuns(seededModelCatalog(), NOW);
const text = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&#x27;/g, "'").replace(/&amp;/g, "&");

describe("summary", () => {
  it("is one line, the next change or none, How, and the one action", () => {
    const s = creditsSummary([LIVE_ROW], ZERO, NOW);
    const html = renderToStaticMarkup(<CreditsSummary line={s.line} next={s.next} onHow={() => {}} onStart={() => {}} />);
    expect(text(html)).toContain("1 credit = $0.001 · margin 0% · rounds up to the next 5 credits");
    expect(text(html)).toContain("No change scheduled.");
    expect(text(html)).toContain("How is this worked out?");
    expect(html).toContain('id="credits-change-start"');
    expect(renderToStaticMarkup(<CreditsSummary line={s.line} next={s.next} onHow={() => {}} onStart={null} />)).not.toContain("Change credit settings");
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

describe("typical runs table", () => {
  it("shows credits with rounding and flat notes, or before and after with a change", () => {
    const single = text(renderToStaticMarkup(<TypicalRunsTable rows={creditRunRows(runs, ZERO, null)} />));
    expect(single).toContain("$0.00695 is 6.95 credits, rounded up to 10 (+44%). With a step of 1 it would be 7.");
    expect(single).toContain("Prompt runs are charged a flat price; margin doesn't apply.");
    expect(single).not.toContain("Change");
    const both = text(renderToStaticMarkup(<TypicalRunsTable rows={creditRunRows(runs, ZERO, { marginPercent: 10, roundStep: 10 })} />));
    expect(both).toContain("+10%");
    expect(both).toContain("No change");
  });
});

describe("settings card and edit bar", () => {
  it("edits margin and step, shows the fixed settings with why, and flags a margin to fix", () => {
    const ok = renderToStaticMarkup(<CreditSettingsCard margin="10" step={10} draft={{ marginPercent: 10, roundStep: 10 }} live={ZERO} onMargin={() => {}} onStep={() => {}} />);
    for (const t of ["Margin", "Rounding step", "1 credit", "5 credits", "10 credits", "Credit rate", "$0.001 per credit", "Always up", "never charges below what it costs us", "Worked example"]) {
      expect(text(ok)).toContain(t);
    }
    const bad = renderToStaticMarkup(<CreditSettingsCard margin="250" step={5} draft={null} live={ZERO} onMargin={() => {}} onStep={() => {}} />);
    expect(bad).toContain('aria-invalid="true"');
    expect(text(bad)).toContain("Use a number from 0 to 200");
    const bar = renderToStaticMarkup(<CreditEditBar summary="Margin 0% → 10%" invalid={false} canGoOn onCancel={() => {}} onNext={() => {}} />);
    expect(text(bar)).toContain("Settings");
    expect(text(bar)).toContain("Margin 0% → 10%");
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
    expect(t).toContain("Check the margin: you entered 100%.");
    expect(t).toContain("Agencies affected");
    expect(t).toContain("Acme");
    expect(t).toContain("Credits agencies already hold will buy fewer runs.");
  });
});

describe("review over a scheduled change", () => {
  it("lists what the change held and what replaces it, and the button says so", () => {
    const scheduled = { ...LIVE_ROW, id: "s", effectiveFrom: "2026-11-25T04:30:00Z", marginPercent: 10, roundStep: 10 as const };
    const review = buildCreditReview({ settings: [LIVE_ROW, scheduled], draft: { marginPercent: 20, roundStep: 10 }, when: defaultCreditWhen(NOW), now: NOW, runs, agencyRuns: [], modelRuns: {} });
    const t = text(renderToStaticMarkup(<CreditReviewStep review={review} />));
    expect(t).toContain("This replaces the change scheduled for 25 Nov 2026, 10:00 IST.");
    expect(t).toContain("Margin10%20%");
    expect(t).toContain("Rounding step10 creditsSame");
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
  it("the workspace shows the summary and typical runs, with no settings card until the flow opens", () => {
    const html = renderToStaticMarkup(
      <CreditsWorkspace
        summary={creditsSummary([LIVE_ROW], ZERO, NOW)}
        live={ZERO}
        settings={[LIVE_ROW]}
        starts={[{ id: LIVE_ROW.id, effectiveFrom: LIVE_ROW.effectiveFrom }]}
        runs={runs}
        agencyRuns={[]}
        modelRuns={{}}
        aside={<aside>History</aside>}
      />,
    );
    expect(text(html)).toContain("What typical runs cost in credits");
    expect(text(html)).toContain("Change credit settings");
    expect(text(html)).not.toContain("New settings");
  });
});
