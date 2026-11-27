import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: () => ({ rpc: m.rpc }) }));
vi.mock("@/lib/ai-models/catalog", () => ({ getAiCatalog: async () => ({ models: [{ id: "kling-omni", label: "Kling 3.1 Omni" }], prices: [] }) }));

import { usageRange, previousRange, isUsageBy, isUsagePeriod } from "../usage-period";
import { kindOf, typesOf } from "../usage-kinds";
import { buildUsageOverview, type OverviewDbRow } from "../usage-overview";
import { getUsageOverview, listUsageRuns } from "@/lib/db/billing-usage";

beforeEach(() => m.rpc.mockReset());

describe("usage months (India time)", () => {
  it("runs from the 1st at midnight in India to the next 1st", () => {
    expect(usageRange("this_month", new Date("2026-11-21T06:00:00Z"))).toEqual({ from: "2026-10-31T18:30:00.000Z", to: "2026-11-30T18:30:00.000Z" });
    expect(usageRange("last_month", new Date("2026-11-21T06:00:00Z"))).toEqual({ from: "2026-09-30T18:30:00.000Z", to: "2026-10-31T18:30:00.000Z" });
  });

  it("counts the evening of the 31st in India as the next month", () => {
    expect(usageRange("this_month", new Date("2026-10-31T19:00:00Z")).from).toBe("2026-10-31T18:30:00.000Z");
  });

  it("goes back across a year, and knows the month before each period", () => {
    expect(usageRange("last_month", new Date("2027-01-10T06:00:00Z"))).toEqual({ from: "2026-11-30T18:30:00.000Z", to: "2026-12-31T18:30:00.000Z" });
    expect(previousRange("this_month", new Date("2026-11-21T06:00:00Z")).from).toBe("2026-09-30T18:30:00.000Z");
    expect(previousRange("last_month", new Date("2026-11-21T06:00:00Z"))).toEqual({ from: "2026-08-31T18:30:00.000Z", to: "2026-09-30T18:30:00.000Z" });
  });

  it("accepts only known groups and months", () => {
    expect(isUsageBy("canvas")).toBe(true);
    expect(isUsageBy("kind")).toBe(true);
    expect(isUsageBy("team")).toBe(false);
    expect(isUsagePeriod("last_month")).toBe(true);
    expect(isUsagePeriod("all")).toBe(false);
  });
});

describe("kinds of work", () => {
  it("puts every charged run type in one of four kinds", () => {
    expect(["video", "edit", "lipsync"].map(kindOf)).toEqual(["video", "video", "video"]);
    expect(["image", "voice", "dub", "transcribe", "prompt"].map(kindOf)).toEqual(["image", "voice", "voice", "voice", "text"]);
    expect(typesOf("voice").sort()).toEqual(["dub", "transcribe", "voice"]);
  });
});

const NOW = new Date("2026-11-03T06:00:00Z"); // 3 Nov, India
const RANGE = usageRange("this_month", NOW);
const row = (over: Partial<OverviewDbRow>): OverviewDbRow => ({ section: "day", key: null, name: null, detail: null, removed: false, credits: 0, runs: 0, ...over });
const ROWS: OverviewDbRow[] = [
  row({ section: "day", key: "2026-11-01", detail: "video", credits: "1000", runs: 2 }),
  row({ section: "day", key: "2026-11-01", detail: "lipsync", credits: 200, runs: 1 }),
  row({ section: "day", key: "2026-11-02", detail: "prompt", credits: 50, runs: 5 }),
  row({ section: "day", key: "2026-11-02", removed: true, credits: 300, runs: 1 }),
  row({ section: "model", key: "kling-omni", detail: "video", credits: 1200, runs: 3 }),
  row({ section: "model", key: "gpt-old", detail: "prompt", credits: 50, runs: 5 }),
  row({ section: "model", removed: true, credits: 300, runs: 1 }),
  row({ section: "member", key: "u1", name: "Asha", credits: 1250, runs: 8 }),
  row({ section: "member", removed: true, credits: 300, runs: 1 }),
  row({ section: "canvas", key: "c1", name: "Diwali reel", detail: "Chupps", credits: 1200, runs: 3 }),
  row({ section: "canvas", key: null, credits: 50, runs: 5 }),
  row({ section: "previous", credits: 9000, runs: 40 }),
  row({ section: "pace", key: "last7", credits: 1550, runs: 9 }),
  row({ section: "pace", key: "prev7", credits: 700, runs: 3 }),
];

describe("the usage overview", () => {
  const o = buildUsageOverview(ROWS, { period: "this_month", ...RANGE, now: NOW, modelLabel: (id) => (id === "kling-omni" ? "Kling 3.1 Omni" : null) });

  it("adds every charge into one total, the chart's days and each breakdown alike", () => {
    expect(o.total).toBe(1550);
    expect(o.runs).toBe(9);
    expect(o.days.map((d) => d.day)).toEqual(["2026-11-01", "2026-11-02", "2026-11-03"]);
    expect(o.days.reduce((s, d) => s + d.total, 0)).toBe(o.total);
    for (const by of ["kind", "model", "member"] as const) expect(o.groups[by].reduce((s, r) => s + r.credits, 0)).toBe(o.total);
  });

  it("splits days and totals by kind of work, deleted work on its own and last", () => {
    expect(o.days[0].kinds).toEqual({ video: 1200, image: 0, voice: 0, text: 0 });
    expect(o.days[1].removed).toBe(300);
    expect(o.groups.kind.map((r) => [r.name, r.credits])).toEqual([["Video", 1200], ["Writing", 50], ["Deleted work", 300]]);
    expect(o.groups.member.at(-1)).toMatchObject({ removed: true, name: "Deleted work" });
  });

  it("names models from the catalog, never by id, and places with their client", () => {
    expect(o.groups.model.map((r) => r.name)).toEqual(["Kling 3.1 Omni", "Older model", "Deleted work"]);
    expect(o.groups.model[0].detail).toBe("Video");
    expect(o.groups.canvas[0]).toMatchObject({ name: "Diwali reel", detail: "Chupps" });
    expect(o.groups.canvas[1]).toMatchObject({ key: null, name: "Outside a canvas" });
  });

  it("keeps the month before and the last two weeks for the pace", () => {
    expect(o).toMatchObject({ previousTotal: 9000, last7: 1550, prev7: 700 });
  });
});

describe("usage reads", () => {
  it("reads a period in one call, with the month before", async () => {
    m.rpc.mockResolvedValue({ data: ROWS, error: null });
    const o = await getUsageOverview("org", "this_month", NOW);
    expect(m.rpc).toHaveBeenCalledWith("org_usage_overview", { p_org_id: "org", p_from: RANGE.from, p_to: RANGE.to, p_prev_from: previousRange("this_month", NOW).from });
    expect(o.groups.model[0].name).toBe("Kling 3.1 Omni");
  });

  it("never treats a failed read as nothing used", async () => {
    m.rpc.mockResolvedValue({ data: null, error: new Error("down") });
    await expect(getUsageOverview("org", "this_month", NOW)).rejects.toThrow("down");
  });

  it("lists one canvas's runs a page at a time, naming who and where", async () => {
    m.rpc.mockResolvedValue({
      data: [{ id: "g1", type: "video", model: "kling-omni", credits: "120", created_at: "2026-11-02T06:00:00Z", member_name: "Asha", client_name: "Chupps", canvas_name: "Diwali reel", total: 21 }],
      error: null,
    });
    await expect(listUsageRuns("org", "canvas", "c1", "this_month", 2)).resolves.toEqual({
      runs: [{ id: "g1", type: "video", model: "Kling 3.1 Omni", credits: 120, createdAt: "2026-11-02T06:00:00Z", memberName: "Asha", clientName: "Chupps", canvasName: "Diwali reel" }],
      total: 21,
    });
    expect(m.rpc).toHaveBeenCalledWith("org_usage_runs", expect.objectContaining({ p_org_id: "org", p_by: "canvas", p_key: "c1", p_types: [], p_offset: 20, p_limit: 20 }));
  });

  it("filters a kind by its run types", async () => {
    m.rpc.mockResolvedValue({ data: [], error: null });
    await expect(listUsageRuns("org", "kind", "video", "last_month", 1)).resolves.toEqual({ runs: [], total: 0 });
    expect(m.rpc).toHaveBeenCalledWith("org_usage_runs", expect.objectContaining({ p_by: "kind", p_key: null, p_types: typesOf("video") }));
  });
});
