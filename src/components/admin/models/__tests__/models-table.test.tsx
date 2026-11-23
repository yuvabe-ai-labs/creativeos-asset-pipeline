import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ModelsTable, type ModelListRow } from "../models-table";

const rows: ModelListRow[] = [
  {
    id: "fal:flux-pro",
    label: "Flux Pro",
    provider: "fal",
    kind: "image",
    status: "live",
    problems: [],
    priceSummary: "$0.050 / output image",
    runs: 12,
    costUsd: 0.6,
    unpriced: 0,
  },
  {
    id: "byteplus:seedance",
    label: "Seedance",
    provider: "byteplus",
    kind: "video",
    status: "hidden",
    problems: [],
    priceSummary: null,
    runs: 5,
    costUsd: 12.5,
    unpriced: 2,
  },
  {
    id: "broken:model",
    label: "Broken Model",
    provider: "broken",
    kind: "image",
    status: "draft",
    problems: ["params is not a list"],
    priceSummary: null,
    runs: 0,
    costUsd: 0,
    unpriced: 0,
  },
];

describe("ModelsTable", () => {
  const html = renderToStaticMarkup(<ModelsTable rows={rows} />);

  it("links each label to its encoded detail page", () => {
    for (const r of rows) {
      expect(html).toContain(`href="/admin/models/${encodeURIComponent(r.id)}"`);
      expect(html).toContain(r.label);
    }
  });

  it("shows status, unpriced runs, problems, costs and missing prices", () => {
    expect(html).toContain("live");
    expect(html).toContain("hidden");
    expect(html).toContain("draft");
    expect(html).toContain("2 unpriced");
    expect(html).toContain("Fails its check");
    expect(html).toContain("$0.60");
    expect(html).toContain("$12.50");
    expect(html).toContain("No price");
    expect(html).toContain("$0.050 / output image");
  });

  it("groups rows by kind under a heading", () => {
    expect(html).toMatch(/<h2[^>]*>image<\/h2>/);
    expect(html).toMatch(/<h2[^>]*>video<\/h2>/);
  });

  it("pluralizes runs and marks unpriced as a warning", () => {
    expect(html).toContain("12 runs");
    const one = renderToStaticMarkup(<ModelsTable rows={[{ ...rows[0], runs: 1 }]} />);
    expect(one).toContain("1 run<");
    expect(html).toMatch(/text-warning-text[^>]*>2 unpriced/);
  });
});
