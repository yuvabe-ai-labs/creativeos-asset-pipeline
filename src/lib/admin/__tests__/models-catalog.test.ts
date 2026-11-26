import { describe, expect, it } from "vitest";
import type { ModelListRow } from "../models-list";
import {
  buildCatalog,
  groupPickers,
  groupSlug,
  kindSummary,
  matchesQuery,
  monthTotals,
  orderRows,
  type CatalogState,
} from "../models-catalog";

let n = 0;
function row(patch: Partial<ModelListRow> & Pick<ModelListRow, "id">): ModelListRow {
  return {
    label: patch.id,
    provider: "Acme",
    kind: "video",
    group: "Video",
    status: "live",
    broken: false,
    order: n++,
    price: { kind: "price", usd: 0.1, unit: "a second", varies: true },
    typical: { credits: 500, label: "5 s, 720p" },
    atCost: false,
    next: null,
    changed: null,
    month: null,
    ...patch,
  };
}

const ROWS: ModelListRow[] = [
  row({ id: "kling-3", label: "Kling 3.0", provider: "Kling", month: { runs: 2, costUsd: 0.5 } }),
  row({ id: "seedance", label: "Seedance 2.5", provider: "Seedance", status: "hidden" }),
  row({ id: "omni-11", label: "Gemini Omni 1.1 Flash", provider: "Google", month: { runs: 174, costUsd: 101.08 } }),
  row({ id: "kling-31", label: "Kling 3.1 Omni", provider: "Kling", status: "draft", price: null, typical: null }),
  row({ id: "veo", label: "Veo 3.1 Fast", provider: "Veo", status: "retired" }),
  row({ id: "nano", label: "Nano Banana", provider: "Gemini", kind: "image", group: "Image", month: { runs: 3, costUsd: 0.12 } }),
  row({ id: "edit-1", label: "Image edit", provider: "OpenAI", kind: "edit", group: "Image" }),
  row({ id: "nano-2", label: "Nano Banana 2", provider: "Gemini", kind: "image", group: "Image" }),
  row({ id: "dub", label: "Dub", provider: "Sarvam", kind: "dub", group: "Audio & lip sync" }),
  row({ id: "broken", label: "Broken one", kind: "video", group: "Video", broken: true, price: null, typical: null }),
];
const ALL: CatalogState = { query: "", view: "all", order: "picker" };
const ids = (rows: readonly ModelListRow[]) => rows.map((r) => r.id);

describe("groupSlug", () => {
  it("gives each kind a short id", () => {
    expect(["Video", "Image", "Text", "Audio & lip sync", "Other"].map((g) => groupSlug(g as never))).toEqual(["video", "image", "text", "audio", "other"]);
  });
});

describe("matchesQuery", () => {
  it("matches name, provider or kind, any case, trimmed", () => {
    expect(matchesQuery(ROWS[0], " KLING ")).toBe(true);
    expect(matchesQuery(ROWS[2], "google")).toBe(true);
    expect(matchesQuery(ROWS[8], "lip sync")).toBe(true);
    expect(matchesQuery(ROWS[0], "zzz")).toBe(false);
    expect(matchesQuery(ROWS[0], "")).toBe(true);
  });
});

describe("orderRows", () => {
  const video = ROWS.filter((r) => r.group === "Video" && r.status !== "retired");
  it("picker order puts hidden, draft and failing rows last, each in its saved place", () => {
    expect(ids(orderRows(video, "picker"))).toEqual(["kling-3", "omni-11", "seedance", "kling-31", "broken"]);
  });
  it("most used puts this month's highest cost first, then the rest in picker order", () => {
    expect(ids(orderRows(video, "used"))).toEqual(["omni-11", "kling-3", "seedance", "kling-31", "broken"]);
  });
  it("within a group, lists one stored kind before the next", () => {
    const image = ROWS.filter((r) => r.group === "Image");
    expect(ids(orderRows(image, "picker"))).toEqual(["nano", "nano-2", "edit-1"]);
  });
});

describe("kindSummary and monthTotals", () => {
  const video = ROWS.filter((r) => r.group === "Video" && r.status !== "retired");
  it("counts live, and hidden, draft or failing only when there are any, with this month's runs and cost", () => {
    expect(kindSummary(video, "all")).toEqual({ counts: "2 live · 1 hidden · 1 draft · 1 failing its check", month: { runs: 176, costUsd: 101.58 } });
    expect(kindSummary([ROWS[8]], "all")).toEqual({ counts: "1 live", month: null });
  });
  it("says only how many are in the picker for agencies", () => {
    expect(kindSummary([ROWS[0], ROWS[2]], "agency")).toEqual({ counts: "2 in the picker", month: null });
  });
  it("adds up the month", () => {
    expect(monthTotals(ROWS).runs).toBe(179);
    expect(monthTotals(ROWS).costUsd).toBeCloseTo(101.7);
  });
});

describe("groupPickers", () => {
  it("gives one picker per stored kind with two or more live models, holding every model of the kind", () => {
    const video = groupPickers(ROWS, "Video");
    expect(video).toHaveLength(1);
    expect(video[0].map((m) => m.id)).toEqual(["kling-3", "seedance", "omni-11", "kling-31", "veo", "broken"]);
    expect(video[0][5]).toEqual({ id: "broken", label: "Broken one", kind: "video", status: "live", broken: true });
  });
  it("leaves out a kind with a single live model", () => {
    expect(groupPickers(ROWS, "Image").map((p) => p[0].kind)).toEqual(["image"]);
    expect(groupPickers(ROWS, "Audio & lip sync")).toEqual([]);
  });
});

describe("buildCatalog", () => {
  it("shows every kind with models, retired folded apart, and Needs a look", () => {
    const c = buildCatalog(ROWS, ALL);
    expect(c.sections.map((s) => s.slug)).toEqual(["video", "image", "audio"]);
    expect(c.sections[0].pickers).toHaveLength(1);
    expect(ids(c.retired)).toEqual(["veo"]);
    expect(c.chips.map((x) => [x.slug, x.count])).toEqual([["video", 5], ["image", 3], ["text", 0], ["audio", 1], ["other", 0]]);
    expect(c.needs).toBe(true);
    expect(c.empty).toBe(false);
  });

  it("what agencies see: live models only, picker order even when most used is chosen, no retired, no Needs a look", () => {
    const c = buildCatalog(ROWS, { ...ALL, view: "agency", order: "used" });
    expect(ids(c.sections[0].rows)).toEqual(["kling-3", "omni-11"]);
    expect(c.sections[0].summary.counts).toBe("2 in the picker");
    expect(c.retired).toEqual([]);
    expect(c.needs).toBe(false);
  });

  it("a search finds retired models too, hides Needs a look and the picker order", () => {
    const c = buildCatalog(ROWS, { ...ALL, query: "veo" });
    expect(c.sections).toEqual([]);
    expect(ids(c.retired)).toEqual(["veo"]);
    expect(c.needs).toBe(false);
    expect(c.empty).toBe(false);
    expect(buildCatalog(ROWS, { ...ALL, query: "kling" }).sections[0].pickers).toEqual([]);
  });

  it("is empty when nothing matches", () => {
    const c = buildCatalog(ROWS, { ...ALL, query: "zzzz" });
    expect(c.empty).toBe(true);
    expect(c.chips.every((x) => x.count === 0)).toBe(true);
  });
});
