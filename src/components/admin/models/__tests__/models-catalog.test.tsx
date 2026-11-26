import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/actions/ai-models", () => ({}));

import type { AttentionItem, ModelListRow } from "@/lib/admin/models-list";
import { ModelsCatalog } from "../models-catalog";
import { ModelsCatalogCard } from "../models-catalog-card";
import { NeedsALookCard } from "../needs-a-look-card";

const base: ModelListRow = {
  id: "gemini:gemini-omni-1.1-flash",
  label: "Gemini Omni 1.1 Flash",
  provider: "Google",
  kind: "video",
  group: "Video",
  status: "live",
  broken: false,
  order: 0,
  price: { kind: "price", usd: 0.0337925, unit: "a second", varies: true },
  typical: { credits: 815, label: "8 s, 720p" },
  atCost: false,
  next: { chip: "−31%", tone: "down", date: "3 Dec", when: "Starts 3 Dec 2026, 13:30 IST.", credits: 560 },
  changed: null,
  month: { runs: 174, costUsd: 101.0808 },
};
const rows: ModelListRow[] = [
  base,
  { ...base, id: "kling:kling-3-0", label: "Kling 3.0", provider: "Kling", order: 1, next: null, changed: "23 Nov", month: null },
  { ...base, id: "kling:kling-3-1-omni", label: "Kling 3.1 Omni", provider: "Kling", status: "draft", order: 2, price: null, typical: null, next: null, month: null },
  { ...base, id: "openai:gpt-5", label: "GPT-5", provider: "OpenAI", kind: "text", group: "Text", order: 3, next: null, month: null },
  { ...base, id: "veo:veo-3-1-fast", label: "Veo 3.1 Fast", provider: "Veo", status: "retired", order: 4, next: null, month: null },
];
const html = (r: ModelListRow, agency = false) => renderToStaticMarkup(<ModelsCatalogCard row={r} agency={agency} />);

describe("ModelsCatalogCard", () => {
  it("leads with the typical run's credits, then what it costs us, rounded with the exact price on hover", () => {
    const out = html(base);
    expect(out).toContain('href="/admin/models/gemini%3Agemini-omni-1.1-flash"');
    expect(out).toContain("815 credits");
    expect(out).toContain("8 s, 720p");
    expect(out).toContain("Costs us from ");
    expect(out).toContain('title="$0.0337925 a second"');
    expect(out).toContain("$0.034");
    expect(out).not.toContain("Live");
  });

  it("shows a scheduled change in credits, with the exact start on hover, and this month's use", () => {
    const out = html(base);
    expect(out).toContain("−31%");
    expect(out).toContain("560 credits from 3 Dec");
    expect(out).toContain('title="Starts 3 Dec 2026, 13:30 IST."');
    expect(out).toContain("174 runs");
    expect(out).toContain("$101.08");
    expect(out).toContain('title="$101.0808"');
  });

  it("has no footer when nothing is different, and says a recent price change otherwise", () => {
    expect(html({ ...base, next: null, month: null })).not.toContain("border-t");
    expect(html(rows[1])).toContain("Price changed 23 Nov");
  });

  it("a draft with no price says it can't run and offers Add prices, outside the name link", () => {
    const out = html(rows[2]);
    expect(out).toContain("Draft");
    expect(out).toContain("No price yet, so it can&#x27;t run.");
    expect(out).toContain('href="/admin/models/kling%3Akling-3-1-omni?change=1"');
    expect(out).toContain("Add prices");
    // The name link closes before Add prices opens: one is never inside the other.
    expect(out.indexOf("</a>")).toBeLessThan(out.indexOf('<a role="button"'));
  });

  it("shows at-cost, failing and hidden models plainly", () => {
    expect(html({ ...base, price: { kind: "at-cost" }, typical: null, atCost: true, next: null })).toContain("Charged at cost");
    expect(html({ ...base, broken: true, price: null, typical: null, next: null })).toContain("Fails its check");
    expect(html({ ...base, status: "hidden", next: null })).toContain("Hidden");
  });

  it("what agencies see: no badge, no cost, no footer", () => {
    const out = html(base, true);
    expect(out).toContain("815 credits");
    expect(out).not.toContain("Costs us");
    expect(out).not.toContain("runs");
    expect(out).not.toContain("−31%");
  });
});

describe("ModelsCatalog", () => {
  const out = renderToStaticMarkup(<ModelsCatalog rows={rows} attention={[]} />);

  it("draws a section per kind with its summary, the kind tabs and the Show and Sort menus", () => {
    expect(out).toContain('id="kind-video"');
    expect(out).toContain('id="kind-text"');
    expect(out).toContain("2 live · 1 draft");
    expect(out).toContain("this month");
    expect(out).toContain("Search models or providers");
    expect(out).toContain('aria-label="Kinds"');
    expect(out).toContain('role="tab"');
    expect(out).toContain('aria-selected="true"');
    expect(out).toContain("Show:");
    expect(out).toContain("Everything");
    expect(out).toContain("Sort:");
    expect(out).toContain("Picker order");
  });

  it("folds retired models at the end", () => {
    expect(out).toContain("Retired");
    expect(out).toContain('aria-expanded="false"');
    expect(out).not.toContain("Veo 3.1 Fast");
  });
});

describe("NeedsALookCard", () => {
  const items: AttentionItem[] = [
    { key: "a", modelId: "kling:kling-3-1-omni", tone: "warn", name: "Kling 3.1 Omni", text: "has no price, so agencies can't use it yet", detail: "", action: "Add prices", href: "/admin/models/kling%3Akling-3-1-omni?change=1" },
    { key: "b", modelId: base.id, tone: "next", name: base.label, text: "prices drop 31% on 3 Dec, in 7 days", detail: "A typical run goes from 815 to 560 credits.", action: "Review", href: "/admin/models/x?change=1" },
  ];

  it("lists each item on one line with its one action", () => {
    const out = renderToStaticMarkup(<NeedsALookCard items={items} />);
    expect(out).toContain("Needs a look");
    expect(out).toContain("Kling 3.1 Omni </span><span class=\"\">has no price, so agencies can&#x27;t use it yet.</span>");
    expect(out).toContain("Gemini Omni 1.1 Flash: ");
    expect(out).toContain("A typical run goes from 815 to 560 credits.");
    expect(out).toContain('aria-label="Add prices: Kling 3.1 Omni"');
    expect(out).toContain('aria-label="Review: Gemini Omni 1.1 Flash"');
  });

  it("is nothing when nothing needs a look", () => {
    expect(renderToStaticMarkup(<NeedsALookCard items={[]} />)).toBe("");
  });
});
