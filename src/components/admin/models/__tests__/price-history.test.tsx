import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/lib/actions/ai-models", () => ({ cancelAiModelPriceAction: vi.fn() }));

import { PriceHistory } from "../price-history";
import type { PriceHistoryRow } from "../price-history";
import type { AiModelPrice } from "@/lib/ai-models/types";

const MODEL = "fal:video-x";
const now = "2026-11-23T10:00:00.000Z";

function row(id: string, effectiveFrom: string, extra: Partial<AiModelPrice> = {}): PriceHistoryRow {
  return {
    price: {
      id,
      modelId: MODEL,
      effectiveFrom,
      lines: [{ meter: "video_second", unit_usd: 0.1, when: { resolution: "1080p" } }],
      estimate: {},
      sourceUrl: null,
      note: null,
      ...extra,
    },
    problems: [],
    id,
    effectiveFrom,
    createdAt: effectiveFrom,
    createdByName: "Priya",
  };
}

const past = row("past", "2026-01-01T00:00:00.000Z");
const current = row("current", "2026-06-01T00:00:00.000Z", {
  sourceUrl: "https://example.com/pricing",
  note: "Price cut in June",
});
const future = row("future", "2026-12-01T00:00:00.000Z");

function articles(html: string): string[] {
  return html.split("data-price-id=").slice(1);
}

describe("PriceHistory", () => {
  it("lists rows newest first", () => {
    const html = renderToStaticMarkup(<PriceHistory modelId={MODEL} prices={[past, future, current]} now={now} />);
    const ids = articles(html).map((a) => /^"([^"]+)"/.exec(a)?.[1]);
    expect(ids).toEqual(["future", "current", "past"]);
  });

  it("marks the row in effect now as Current, and only a future row starts later with Cancel", () => {
    const html = renderToStaticMarkup(<PriceHistory modelId={MODEL} prices={[past, current, future]} now={now} />);
    const [f, c, p] = articles(html);
    expect(f).toContain("Starts ");
    expect(f).toContain(">Cancel</button>");
    expect(c).toContain("Current");
    expect(c).not.toContain(">Cancel</button>");
    expect(p).not.toContain("Current");
    expect(p).not.toContain(">Cancel</button>");
  });

  it("renders each line with the price formatter, the source, note and who added it", () => {
    const html = renderToStaticMarkup(<PriceHistory modelId={MODEL} prices={[current]} now={now} />);
    expect(html).toContain("$0.1 / video second (resolution 1080p)");
    expect(html).toContain('href="https://example.com/pricing"');
    expect(html).toContain("Price cut in June");
    expect(html).toContain("Added by Priya");
  });

  it("shows a row that fails its check with its problems, and Cancel when it hasn't started", () => {
    const broken: PriceHistoryRow = { ...future, price: null, problems: ["lines.0.meter: Invalid option"] };
    const html = renderToStaticMarkup(<PriceHistory modelId={MODEL} prices={[broken]} now={now} />);
    expect(html).toContain("Fails its check");
    expect(html).toContain("lines.0.meter: Invalid option");
    expect(html).toContain("Starts ");
    expect(html).toContain(">Cancel</button>");
  });

  it("says when there are no prices", () => {
    const html = renderToStaticMarkup(<PriceHistory modelId={MODEL} prices={[]} now={now} />);
    expect(html).toContain("No prices yet.");
  });
});
