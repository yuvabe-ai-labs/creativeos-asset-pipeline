import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { seededModelCatalog } from "@/lib/ai-models/test-catalog";
import type { AiModel } from "@/lib/ai-models/types";
import { monthSummary, settingsPeoplePick, statusChange, type PickerModel } from "@/lib/admin/model-page";
import { priceTimeline } from "@/lib/admin/price-sheet";
import { ModelHeader } from "../model-header";
import { ModelStatusPending } from "../model-status-pending";
import { PriceSheet } from "../price-sheet";
import { PriceTimeline } from "../price-timeline";
import { MonthSummary } from "../month-summary";

const catalog = seededModelCatalog();
const NOW = new Date("2026-11-24T06:30:00Z");
const OMNI11 = "gemini:gemini-omni-1.1-flash";
const model = (id: string): AiModel => {
  const m = catalog.models.find((x) => x.id === id);
  if (!m) throw new Error(`no seeded model ${id}`);
  return m;
};
const pricesOf = (id: string) => catalog.prices.filter((p) => p.modelId === id).sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
const [omniNow, omniNext] = pricesOf(OMNI11);
const ZERO = { marginPercent: 0, roundStep: 5 as const };
const omni = model(OMNI11);
const picker: PickerModel[] = catalog.models
  .filter((m) => m.kind === "video")
  .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))
  .map((m) => ({ id: m.id, label: m.label, kind: m.kind, status: m.status, broken: false }));

function header(patch: Partial<Parameters<typeof ModelHeader>[0]> = {}) {
  return renderToStaticMarkup(
    <ModelHeader
      model={{ id: OMNI11, kind: "video", label: omni.label, provider: "Google", status: "live", replacedBy: null, replacedByLabel: null, broken: false }}
      hasPrices
      hasLivePrice
      canGoLive
      runsThisMonth={174}
      otherLive={3}
      picker={picker}
      replacements={[{ id: "kling:kling-3-0", label: "Kling 3.0", provider: "Kling" }]}
      settings={settingsPeoplePick(omni.params)}
      {...patch}
    />,
  );
}

describe("ModelHeader", () => {
  it("shows the name to rename, status, maker, picker order and settings, and the one primary action", () => {
    const html = header();
    expect(html).toContain(omni.label);
    expect(html).toContain(`aria-label="Model name: ${omni.label}, edit"`);
    expect(html).toContain('aria-label="Status: Live. Change"');
    expect(html).toContain("Made by Google");
    expect(html).toContain("9th of 9 in the picker");
    expect(html).toContain("Settings people pick");
    expect(html).toContain("Change prices");
    // Not wired until the change-prices flow lands: shown, disabled.
    expect(html).toMatch(/<button[^>]*disabled[^>]*>.*Change prices/);
    // The id stays out of the visible text.
    expect(html).not.toContain(`>${OMNI11}<`);
  });

  it("says Add prices with no price, and hides the price action on a broken row", () => {
    expect(header({ hasPrices: false })).toContain("Add prices");
    const broken = header({ model: { id: OMNI11, kind: "video", label: "Broken", provider: "Google", status: "live", replacedBy: null, replacedByLabel: null, broken: true } });
    expect(broken).not.toContain("Change prices");
    expect(broken).toContain("in the picker");
  });

  it("names a retired model's replacement, or says it has none", () => {
    const base = { id: OMNI11, kind: "video", label: omni.label, provider: "Google", status: "retired", replacedByLabel: null, broken: false };
    expect(header({ model: { ...base, replacedBy: "kling:kling-3-0" } })).toContain("Replaced by Kling 3.0");
    expect(header({ model: { ...base, replacedBy: "veo:veo-3.1", replacedByLabel: "Veo 3.1 Quality" } })).toContain("Replaced by Veo 3.1 Quality (no longer live)");
    expect(header({ model: { ...base, replacedBy: null } })).toContain("No replacement");
  });
});

describe("ModelStatusPending", () => {
  const base = { label: omni.label, kind: "video", from: "live", savedReplacement: null, replacement: null, otherLive: 3, hasPrice: true, priceStarts: null, canGoLive: true, runsThisMonth: 174 };
  const render = (to: string, patch = {}) =>
    renderToStaticMarkup(
      <ModelStatusPending
        change={statusChange({ ...base, to, ...patch })}
        replacement={null}
        replacements={[{ id: "kling:kling-3-0", label: "Kling 3.0", provider: "Kling" }]}
        saving={false}
        onReplacement={() => {}}
        onSave={() => {}}
        onCancel={() => {}}
      />,
    );

  it("says what the change does and offers Save and Cancel", () => {
    const html = render("hidden");
    expect(html).toContain("Live → Hidden.");
    expect(html).toContain("174 runs this month; nodes already using it keep working.");
    expect(html).toContain("Save status");
    expect(html).toContain("Cancel");
  });

  it("blocks Save with the guard's reason, and asks for a replacement to retire", () => {
    const last = render("hidden", { otherLive: 0 });
    expect(last).toContain("is the only live video model");
    expect(last).toMatch(/<button[^>]*disabled[^>]*>Save status/);
    const retire = render("retired");
    expect(retire).toContain("Pick a replacement");
    expect(retire).toMatch(/<button[^>]*disabled[^>]*>Save status/);
  });
});

describe("PriceSheet", () => {
  it("shows the grid at stored precision with credits per second, other charges, footnote and tabs", () => {
    const html = renderToStaticMarkup(<PriceSheet model={omni} status="live" current={omniNow} next={omniNext} settings={ZERO} />);
    for (const t of ["Per second of video", "Live now", "From 3 Dec", "Resolution", "360p", "$0.0337925", "33.79 credits/s", "4K", "$0.30408", "Other charges", "Per 1M input tokens", "$1.50", "$17.50"]) {
      expect(html).toContain(t);
    }
    expect(html).toContain("Credits are shown per second before a run is rounded up to the next 5 credits. Token prices are per 1M tokens.");
    expect(html).toContain("Try a run");
    expect(html).toContain("8 s, 720p");
    expect(html).toContain(">825<");
  });

  it("lays out an image model by size and quality", () => {
    const sun = model("openai:gpt-image-2.5-sunburst");
    const html = renderToStaticMarkup(<PriceSheet model={sun} status="live" current={pricesOf(sun.id)[0]} next={null} settings={ZERO} />);
    for (const t of ["Per image", "Square", "1024 × 1024", "Extra high", "$0.2107", "210.7 credits", "References", "A typical run adds the prompt and one reference image."]) {
      expect(html).toContain(t);
    }
    expect(html).not.toContain("Live now");
  });

  it("shows the empty sheet with the settings to price and the dashed Add prices chip", () => {
    const html = renderToStaticMarkup(<PriceSheet model={model("kling:kling-3-0")} status="draft" current={null} next={null} settings={ZERO} />);
    expect(html).toContain("No price yet");
    expect(html).toContain("so Kling 3.0 stays a draft.");
    expect(html).toContain("720p, 1080p, 4K, each with audio and no audio.");
    expect(html).toContain("Add prices");
    expect(html).toContain("border-dashed");
  });
});

describe("PriceTimeline", () => {
  it("shows each row with its badge, summary, who, Cancel and the pricing page", () => {
    const t = priceTimeline(
      [omniNow, omniNext].map((p) => ({ id: p.id, effectiveFrom: p.effectiveFrom, createdAt: "2026-11-20T06:00:00Z", createdBy: "u", createdByName: "Arun", price: p, problems: [] })),
      { now: NOW, provider: "Google", callerId: "u" },
    );
    const html = renderToStaticMarkup(<PriceTimeline modelId={OMNI11} timeline={t} />);
    for (const t2 of ["From 3 Dec 2026, 13:30 IST", "08:00 UTC", "Next, in 9 days", "5 prices −31%.", "Added by Arun on 20 Nov 2026", "Cancel this change", "Since 1 Jan 2026", "Live now", "Google&#x27;s pricing page"]) {
      expect(html).toContain(t2);
    }
    expect(html).not.toContain("Undo this change");
    // A screen reader hears which change each button acts on.
    expect(html).toContain('aria-label="Cancel the 3 Dec change"');
  });

  it("names the change its Undo takes back", () => {
    const fresh = { ...omniNow, id: "fresh", effectiveFrom: "2026-11-24T05:00:00Z" };
    const t = priceTimeline(
      [omniNow, fresh].map((p) => ({ id: p.id, effectiveFrom: p.effectiveFrom, createdAt: p.effectiveFrom, createdBy: "u", createdByName: "Arun", price: p, problems: [] })),
      { now: NOW, provider: "Google", callerId: "u" },
    );
    const html = renderToStaticMarkup(<PriceTimeline modelId={OMNI11} timeline={t} />);
    expect(html).toContain('aria-label="Undo the 24 Nov change"');
  });

  it("keeps a broken row with its problems", () => {
    const t = priceTimeline(
      [{ id: "bad", effectiveFrom: "2026-11-01T00:00:00Z", createdAt: "2026-10-30T00:00:00Z", createdBy: null, createdByName: null, price: null, problems: ["lines: Expected array"] }],
      { now: NOW, provider: "Google", callerId: "u" },
    );
    const html = renderToStaticMarkup(<PriceTimeline modelId={OMNI11} timeline={t} />);
    expect(html).toContain("Fails its check");
    expect(html).toContain("lines: Expected array");
  });

  it("says when there are no prices", () => {
    expect(renderToStaticMarkup(<PriceTimeline modelId={OMNI11} timeline={{ items: [], source: null }} />)).toContain("No prices yet.");
  });
});

describe("MonthSummary", () => {
  it("shows runs, what we paid and credits, or that there were none", () => {
    const html = renderToStaticMarkup(<MonthSummary month="November" summary={monthSummary({ runs: 174, costUsd: 101.08, credits: 101205, unpriced: 0 })} />);
    for (const t of ["This month", "November", "Runs", "174", "We paid", "$101.08", "Credits charged", "101,205", "Every run was charged at the price live when it started."]) {
      expect(html).toContain(t);
    }
    expect(renderToStaticMarkup(<MonthSummary month="November" summary={null} />)).toContain("No runs yet this month.");
    // One column at phone width, three from sm up, as in the prototype.
    expect(html).toContain("grid-cols-1");
    expect(html).toContain("sm:grid-cols-3");
  });
});
