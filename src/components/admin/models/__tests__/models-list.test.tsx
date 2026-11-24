import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { AttentionItem, ModelListRow } from "@/lib/admin/models-list";
import { ModelsList } from "../models-list";
import { NeedsALookCard } from "../needs-a-look-card";
import { ModelListRowView } from "../model-list-row";

const base: ModelListRow = {
  id: "gemini:gemini-omni-1.1-flash",
  label: "Gemini Omni 1.1 Flash",
  provider: "Google",
  group: "Video",
  status: "live",
  broken: false,
  price: { from: "$0.0337925 a second", to: "up to $0.30408 at 4K", single: false },
  typical: { credits: 815, label: "8 s, 720p" },
  atCost: false,
  next: { chip: "−31%", tone: "down", date: "3 Dec" },
  month: { runs: 174, cost: "$101.08" },
};
const rows: ModelListRow[] = [
  base,
  { ...base, id: "kling:kling-3-1-omni", label: "Kling 3.1 Omni", provider: "Kling", status: "draft", price: null, typical: null, next: null, month: null },
  { ...base, id: "openai:gpt-5", label: "GPT-5", provider: "OpenAI", group: "Text", next: null, month: null },
  { ...base, id: "old:one", label: "Old one", group: "Image", status: "retired", next: null, month: null },
];

describe("ModelListRowView", () => {
  it("shows name, maker, status, price range, typical run, next change and this month", () => {
    const html = renderToStaticMarkup(<ModelListRowView row={base} />);
    expect(html).toContain('href="/admin/models/gemini%3Agemini-omni-1.1-flash"');
    for (const t of ["Gemini Omni 1.1 Flash", "Google", "Live", "from ", "$0.0337925 a second", "up to $0.30408 at 4K", "815 credits", "8 s, 720p", "−31%", "3 Dec", "174 runs", "$101.08"]) {
      expect(html).toContain(t);
    }
    // The model id only travels in the link, never as text.
    expect(html).not.toContain(">gemini:gemini-omni-1.1-flash<");
  });

  it("offers Add prices and says No price yet when there is no price", () => {
    const html = renderToStaticMarkup(<ModelListRowView row={rows[1]} />);
    expect(html).toContain("Add prices");
    expect(html).toContain("No price yet");
    expect(html).toContain("Draft");
    expect(html).toContain("No runs");
  });

  it("words an at-cost model and a row that fails its check", () => {
    expect(renderToStaticMarkup(<ModelListRowView row={{ ...base, typical: null, atCost: true }} />)).toContain("Charged at cost");
    const broken = renderToStaticMarkup(<ModelListRowView row={{ ...base, broken: true, price: null, typical: null }} />);
    expect(broken).toContain("Fails its check");
    expect(broken).not.toContain("Add prices");
  });

  it("says Charged at cost for a priced row with no typical run", () => {
    expect(renderToStaticMarkup(<ModelListRowView row={{ ...base, typical: null, atCost: true }} />)).toContain("Charged at cost");
  });

  it("keeps a retired row's text at full strength and quietens only its badge", () => {
    const html = renderToStaticMarkup(<ModelListRowView row={{ ...base, status: "retired" }} />);
    expect(html).not.toContain("opacity-");
    expect(html).toContain("text-foreground/80");
    expect(html).toContain("Retired");
  });

  it("drops the from when a price is the same at every setting, and never counts runs that were not priced", () => {
    const html = renderToStaticMarkup(
      <ModelListRowView row={{ ...base, price: { from: "$0.039 an image", to: "same at every setting", single: true }, month: { runs: 1, cost: "$0.04" } }} />,
    );
    expect(html).not.toContain("from ");
    expect(html).toContain("1 run<");
    expect(html).not.toContain("not priced");
  });
});

describe("ModelsList", () => {
  const html = renderToStaticMarkup(<ModelsList rows={rows} />);

  it("has kind tabs, the runs toggle and search", () => {
    for (const t of ["All", "Video", "Image", "Text", "Audio &amp; lip sync", "Other", "Only with runs this month", 'placeholder="Search models"']) {
      expect(html).toContain(t);
    }
    for (const h of ["Our price", "Typical run", "Next change", "This month"]) expect(html).toContain(h);
  });

  it("groups by kind with live counts and hides retired models behind a button", () => {
    expect(html.indexOf(">Video<")).toBeLessThan(html.indexOf(">Text<"));
    expect(html).toContain("1 live");
    expect(html).not.toContain("Old one");
    expect(html).toContain("Show 1 retired model");
  });

  it("says what to do when nothing matches", () => {
    expect(renderToStaticMarkup(<ModelsList rows={[]} />)).toContain("No models match. Clear the search or pick another kind.");
  });
});

describe("NeedsALookCard", () => {
  const items: AttentionItem[] = [
    { key: "c", modelId: null, tone: "next", name: null, text: "Credit settings change on 3 Dec", detail: "Margin 20%, rounds up to the next 10 credits, from 3 Dec 2026, 00:00 IST. Today: margin 0%, rounds up to the next 5 credits.", action: "Review", href: "/admin/credits" },
    { key: "k", modelId: "kling:kling-3-1-omni", tone: "bad", name: "Kling 3.1 Omni", text: "has no price yet", detail: "Runs can't be charged, so it stays a draft until it has one.", action: "Add prices", href: "/admin/models/kling%3Akling-3-1-omni" },
  ];

  it("counts and lists each item with its action", () => {
    const html = renderToStaticMarkup(<NeedsALookCard items={items} />);
    expect(html).toContain("Needs a look");
    expect(html).toContain(">2<");
    expect(html).toContain("Kling 3.1 Omni");
    expect(html).toContain("has no price yet");
    expect(html).toContain("Runs can&#x27;t be charged");
    expect(html).toContain('href="/admin/credits"');
    expect(html).toContain("Add prices");
  });

  it("renders nothing when there is nothing to look at", () => {
    expect(renderToStaticMarkup(<NeedsALookCard items={[]} />)).toBe("");
  });
});
