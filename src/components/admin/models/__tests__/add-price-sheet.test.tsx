import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/lib/actions/ai-models", () => ({ addAiModelPriceAction: vi.fn() }));

import { AddPriceSheet, AddPriceForm, previewText } from "../add-price-sheet";
import { draftFromCurrent } from "../price-draft";
import { seededModelCatalog } from "@/lib/ai-models/test-catalog";

const catalog = seededModelCatalog();
const NANO_PRO = "gemini:gemini-3-pro-image";
const model = catalog.models.find((m) => m.id === NANO_PRO)!;
const current = catalog.prices.find((p) => p.modelId === NANO_PRO)!;
const textModel = catalog.models.find((m) => m.kind === "text")!;
const now = new Date("2026-11-23T10:30:00Z");

describe("AddPriceSheet", () => {
  it("renders the Add a price trigger", () => {
    const html = renderToStaticMarkup(<AddPriceSheet model={model} current={current} />);
    expect(html).toContain("Add a price");
    expect(html).toContain("border-dashed");
  });

  it("re-exports previewText", () => {
    expect(previewText(textModel, draftFromCurrent(null, now), null)).toBe("No run preview for this kind of model.");
  });
});

describe("AddPriceForm", () => {
  const noop = () => {};
  const render = (draft = draftFromCurrent(current, now)) =>
    renderToStaticMarkup(
      <AddPriceForm model={model} current={current} draft={draft} onChange={noop} minDay="2026-11-23" />,
    );

  it("starts from the current row's lines and estimate", () => {
    const html = render();
    expect(html).toContain('value="0.134"');
    expect(html).toContain('value="1K"');
    expect(html).toContain('value="input_tokens_base"');
    expect(html).toContain('value="180"');
    expect(html).toContain('min="2026-11-23"');
    expect(html).toMatch(/<label[^>]*class="[^"]*text-eyebrow[^"]*"[^>]*for="price-date"/);
    expect(html).toContain("A day already begun in UTC starts now. A later day starts at 00:00 UTC.");
  });

  it("shows the run preview and the condition warnings before saving", () => {
    const d = draftFromCurrent(current, now);
    const bad = { ...d, lines: [{ ...d.lines[0], when: [{ key: "colour", value: "red" }] }, ...d.lines.slice(1)] };
    const html = render(bad);
    expect(html).toContain(previewText(model, bad, current));
    expect(renderToStaticMarkup(<AddPriceForm model={model} current={current} draft={d} onChange={noop} minDay="2026-11-23" />))
      .toContain(previewText(model, d, current));
    expect(previewText(model, d, current)).toMatch(/^A default run: \d+ credits \(was \d+\)$/);
    expect(html).toContain("output_image: colour is not a price setting of this model");
  });

  it("has dashed Add condition and Add allowance chips", () => {
    const html = render();
    expect(html).toContain("Add condition");
    expect(html).toContain("Add allowance");
    expect(html).toContain("Add line");
    expect(html).toContain("border-dashed");
  });
});
