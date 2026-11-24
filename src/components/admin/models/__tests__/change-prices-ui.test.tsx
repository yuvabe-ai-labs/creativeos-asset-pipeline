import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {}, replace: () => {} }), usePathname: () => "/admin/models/x" }));
vi.mock("@/lib/actions/ai-models", () => ({}));
import { seededModelCatalog } from "@/lib/ai-models/test-catalog";
import type { AiModel } from "@/lib/ai-models/types";
import { applyEdits, buildReview } from "@/lib/admin/change-prices";
import { lineKey } from "@/lib/admin/price-grid";
import { ModelHeader } from "../model-header";
import { EditBar } from "../change-prices/edit-bar";
import { GridEditor } from "../change-prices/grid-editor";
import { PriceEditorCard } from "../change-prices/price-editor-card";
import { ReviewStep } from "../change-prices/review-step";
import { changePricesReducer, closedFlow, defaultWhens } from "../change-prices/use-change-prices";

const catalog = seededModelCatalog();
const NOW = new Date("2026-11-24T06:30:00Z");
const OMNI11 = "gemini:gemini-omni-1.1-flash";
const omni = catalog.models.find((m) => m.id === OMNI11) as AiModel;
const [live, scheduled] = catalog.prices.filter((p) => p.modelId === OMNI11).sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
const ZERO = { marginPercent: 0, roundStep: 5 as const };
const k360 = lineKey("video_second", { resolution: "360p" });
const k720 = lineKey("video_second", { resolution: "720p" });
const editing = changePricesReducer(changePricesReducer(closedFlow, { type: "start", whens: defaultWhens(scheduled, NOW) }), { type: "choose" });

describe("header", () => {
  const props = {
    model: { id: OMNI11, kind: "video", label: omni.label, provider: "Google", status: "live", replacedBy: null, replacedByLabel: null, broken: false },
    hasPrices: true, hasLivePrice: true, canGoLive: true, runsThisMonth: 1, otherLive: 1, picker: [], replacements: [], settings: [],
  };
  it("Change prices is on once the flow is passed, and hidden while it is open", () => {
    const on = renderToStaticMarkup(<ModelHeader {...props} onChangePrices={() => {}} />);
    const button = on.match(/<button[^>]*id="change-prices-start"[^>]*>/)?.[0];
    expect(button).toBeDefined();
    expect(button).not.toMatch(/sdisabled(=""|s|>)/);
    expect(renderToStaticMarkup(<ModelHeader {...props} onChangePrices={() => {}} changingPrices />)).not.toContain("Change prices");
  });
});

describe("GridEditor", () => {
  it("draws a field per offered cell and other charge, at the stored price, tokens per 1M", () => {
    const html = renderToStaticMarkup(<GridEditor model={omni} base={live} values={{}} percentKeys={[]} settings={ZERO} onType={() => {}} onReset={() => {}} />);
    expect(html.match(/<input/g)).toHaveLength(live.lines.length);
    expect(html).toContain('value="0.0337925"');
    expect(html).toContain('value="1.5"');
    expect(html).toContain('aria-label="360p, price per second"');
    expect(html).toContain("Other charges");
    expect(html).toContain("33.79 credits/s");
  });

  it("shows a typed change with its percent, the ≈ rounded mark, a big-change note, and what to fix", () => {
    const html = renderToStaticMarkup(
      <GridEditor model={omni} base={live} values={{ [k720]: "0.06994", [k360]: "0.06", [lineKey("input_token", {})]: "abc" }} percentKeys={[k720]} settings={ZERO} onType={() => {}} onReset={() => {}} />,
    );
    expect(html).toContain("$0.10136");
    expect(html).toContain("−31%");
    expect(html).toContain("≈ rounded");
    expect(html).toContain("Big change. Check it isn&#x27;t a typo.");
    expect(html).toContain("Not a price. Type 0.07 or −31%.");
    expect(html).toContain('aria-invalid="true"');
  });
});

describe("PriceEditorCard and EditBar", () => {
  it("names the scheduled change being edited and counts the changes", () => {
    const flow = { ...editing, values: { [k720]: "0.05" } };
    const after = { ...scheduled, lines: applyEdits(omni, scheduled, flow.values) };
    const html = renderToStaticMarkup(
      <PriceEditorCard model={omni} flow={flow} base={scheduled} after={after} changeCount={1} invalidCount={0} settings={ZERO} onType={() => {}} onReset={() => {}} onKeys={() => {}} />,
    );
    expect(html).toContain("New prices for the 3 Dec change");
    expect(html).toContain("Starting from the change scheduled for 3 Dec 2026, 13:30 IST.");
    expect(html).toContain("1 change");
    expect(html).toContain("Keyboard");
    expect(html).toContain("Try a run");
  });

  it("edit bar: steps, Next waits for a change, bulk with other charges, and Choose again", () => {
    const html = renderToStaticMarkup(
      <EditBar flow={editing} canGoOn={false} hasOtherCharges scheduledAt={new Date(scheduled.effectiveFrom)} onCancel={() => {}} onNext={() => {}} onBulkText={() => {}} onIncludeOther={() => {}} onBulkApply={() => {}} onChooseAgain={() => {}} />,
    );
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Next: when/);
    expect(html).toContain('aria-current="step"');
    expect(html).toContain("Change every price by");
    expect(html).toContain("Include other charges");
    expect(html).toContain("Editing the change starting 3 Dec 2026, 13:30 IST.");
    expect(html).toContain("Choose again");
  });
});

describe("ReviewStep", () => {
  it("lists every price a replaced change held, the typical run and the agencies", () => {
    const after = { ...scheduled, lines: applyEdits(omni, scheduled, { [k360]: "0.05" }) };
    const review = buildReview({
      model: omni, label: omni.label, prices: [live, scheduled], base: scheduled, after,
      when: { mode: "date", date: "2026-12-03", time: "20:00" }, now: NOW, settings: ZERO, agencies: [{ orgName: "Tide Studio", runs: 23 }],
    });
    const html = renderToStaticMarkup(<ReviewStep review={review} label={omni.label} />);
    expect(html).toContain("This replaces the change scheduled for 3 Dec 2026, 13:30 IST.");
    expect(html).toContain("360p, per second of video");
    expect(html).toContain("Same");
    expect(html).toContain("Typical run");
    expect(html).toContain("Tide Studio");
    expect(html).toContain("Nobody is notified.");
    expect(review.confirm).toBe("Replace the 3 Dec change");
  });
});
