import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/jobs/db", () => ({ getJob: vi.fn(), startJob: vi.fn(), setJobPhase: vi.fn(), succeedJob: vi.fn(), failJob: vi.fn() }));
vi.mock("@/lib/db/moodboards", () => ({ ensureSystemBoards: vi.fn(), listItems: vi.fn(), setItemReading: vi.fn() }));
vi.mock("@/lib/db/copilot-messages", () => ({ insertCopilotMessages: vi.fn(), listCopilotMessages: vi.fn() }));
vi.mock("@/lib/db/signals", () => ({ listSignalNames: vi.fn() }));
import { listSignalNames } from "@/lib/db/signals";
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
vi.mock("@/lib/db/kb", () => ({ getActiveKBVersion: vi.fn() }));
vi.mock("@/lib/journey/thread/opening", () => ({ ensureOpening: vi.fn() }));
vi.mock("@/lib/journey/kb-copilot/job-failed", () => ({ sayJobFailed: vi.fn() }));
vi.mock("@/lib/image-analysis/gemini", () => ({ generateStructured: vi.fn() }));

import { failJob, getJob, succeedJob } from "@/lib/jobs/db";
import { ensureSystemBoards, listItems, type MoodboardItem } from "@/lib/db/moodboards";
import { insertCopilotMessages, listCopilotMessages } from "@/lib/db/copilot-messages";
import { getClientById } from "@/lib/db/clients";
import { getActiveKBVersion } from "@/lib/db/kb";
import { sayJobFailed } from "@/lib/journey/kb-copilot/job-failed";
import { SIGNAL_RULE } from "@/prompts/script-copilot";
import { MARKET_DRAFT_MAX_POSTS, MARKET_GROUP_MODEL } from "../constants";
import { groupReadings, runMarketDraft } from "../draft";
import type { PostReading } from "../read-post";

// D530 step 3: the posts' readings are grouped into draft signals, each a card to keep or drop.

const reading = (handle: string): PostReading => ({
  handle, caption: "c", hook: "Rain on glass", format: "Talking head", pacing: "Fast", onScreenText: "", setting: "Window", occasion: "Monsoon", summary: "s", from: "media",
});
const readings = [{ itemId: "i1", reading: reading("a") }, { itemId: "i2", reading: reading("b") }, { itemId: "i3", reading: reading("c") }];

describe("groupReadings", () => {
  it("drops item ids it was not given", async () => {
    const generate = vi.fn().mockResolvedValue({ signals: [{ name: "Monsoon rituals", tags: ["monsoon"], description: "d", itemIds: ["i1", "i2", "zz"] }] });
    const out = await groupReadings(readings, null, { generate, brandContext: "" });
    expect(out).toEqual([{ name: "Monsoon rituals", tags: ["monsoon"], description: "d", itemIds: ["i1", "i2"] }]);
  });

  it("drops a draft left with fewer than two posts", async () => {
    const generate = vi.fn().mockResolvedValue({ signals: [
      { name: "One post", tags: [], description: "d", itemIds: ["i1", "nope"] },
      { name: "Two posts", tags: [], description: "d", itemIds: ["i2", "i3", "i3"] },
    ] });
    const out = await groupReadings(readings, null, { generate, brandContext: "" });
    expect(out.map((d) => d.name)).toEqual(["Two posts"]);
    expect(out[0].itemIds).toEqual(["i2", "i3"]);
  });

  it("keeps at most six drafts", async () => {
    const generate = vi.fn().mockResolvedValue({ signals: Array.from({ length: 9 }, (_, i) => ({ name: `S${i}`, tags: [], description: "d", itemIds: ["i1", "i2"] })) });
    expect(await groupReadings(readings, null, { generate, brandContext: "" })).toHaveLength(6);
  });

  it("is told the signals that exist or wait, and drops a draft that repeats one (review fix)", async () => {
    const generate = vi.fn().mockResolvedValue({ signals: [
      { name: "monsoon rituals", tags: [], description: "d", itemIds: ["i1", "i2"] },
      { name: "Question hooks", tags: [], description: "d", itemIds: ["i2", "i3"] },
    ] });
    const out = await groupReadings(readings, null, { generate, brandContext: "", avoid: ["Monsoon rituals"] });
    expect(out.map((d) => d.name)).toEqual(["Question hooks"]);
    const text = generate.mock.calls[0][0].parts.map((p: { text?: string }) => p.text ?? "").join("\n");
    expect(text).toContain("Monsoon rituals");
  });

  it("states the signal rule, the focus and the brand's own context, which it may not cite", async () => {
    const generate = vi.fn().mockResolvedValue({ signals: [] });
    await groupReadings(readings, "hooks", { generate, brandContext: "BRAND KB TEXT" });
    const args = generate.mock.calls[0][0];
    expect(args.model).toBe(MARKET_GROUP_MODEL);
    expect(args.system).toContain(SIGNAL_RULE);
    expect(args.system).toMatch(/never supplies claims/i);
    const text = args.parts.map((p: { text?: string }) => p.text ?? "").join("\n");
    expect(text).toContain("hooks");
    expect(text).toContain("BRAND KB TEXT");
    expect(text).toContain("i1");
  });
});

describe("runMarketDraft", () => {
  const item = (id: string, over: Partial<MoodboardItem> = {}) => ({
    id, note: `@h${id} · cap`, thumbnail_url: `https://cdn/${id}.jpg`, archive_status: "ready", reading: reading(`h${id}`), ...over,
  }) as MoodboardItem;
  const group = vi.fn();
  const read = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getJob).mockResolvedValue({ id: "j1", client_id: "c1", kind: "market-draft", input: { focus: null } } as never);
    vi.mocked(ensureSystemBoards).mockResolvedValue({ direct: { id: "bd" }, adjacent: { id: "ba" } } as never);
    vi.mocked(listItems).mockImplementation(async (board) => (board === "bd" ? [item("i1"), item("i2")] : [item("i3")]) as never);
    vi.mocked(getClientById).mockResolvedValue({ id: "c1" } as never);
    vi.mocked(getActiveKBVersion).mockResolvedValue(null);
    vi.mocked(listSignalNames).mockResolvedValue([]);
    vi.mocked(listCopilotMessages).mockResolvedValue([]);
    group.mockResolvedValue([
      { name: "Monsoon rituals", tags: ["monsoon"], description: "Rain at the window.", itemIds: ["i1", "i3"] },
      { name: "Fast hooks", tags: ["hooks"], description: "Opens on a question.", itemIds: ["i1", "i2"] },
    ]);
  });

  it("writes one card per draft and a closing line", async () => {
    expect(await runMarketDraft("j1", { group, read, sleep: async () => {} })).toEqual({ drafts: 2 });
    const rows = vi.mocked(insertCopilotMessages).mock.calls[0][3];
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({
      role: "assistant", content: "", suggestions: [],
      card: {
        kind: "signal-draft", status: "pending", name: "Monsoon rituals", tags: ["monsoon"], description: "Rain at the window.",
        itemIds: ["i1", "i3"], signalId: null,
        thumbs: [{ itemId: "i1", url: "https://cdn/i1.jpg", handle: "hi1" }, { itemId: "i3", url: "https://cdn/i3.jpg", handle: "hi3" }],
      },
    });
    expect(rows[2]).toMatchObject({ role: "assistant", content: "Here are 2 signals from 3 posts. Keep, edit or drop each one." });
    expect(read).not.toHaveBeenCalled();
    expect(succeedJob).toHaveBeenCalled();
  });

  it("reads only the posts without a reading", async () => {
    vi.mocked(listItems).mockImplementation(async (board) => (board === "bd" ? [item("i1", { reading: null }), item("i2")] : []) as never);
    read.mockResolvedValue(reading("fresh"));
    await runMarketDraft("j1", { group, read, sleep: async () => {} });
    expect(read).toHaveBeenCalledTimes(1);
    expect(read.mock.calls[0][0].id).toBe("i1");
  });

  it("waits for archives still pending, then reads what it has", async () => {
    let calls = 0;
    vi.mocked(listItems).mockImplementation(async (board) => {
      calls += 1;
      if (board === "ba") return [] as never;
      return (calls <= 2 ? [item("i1", { archive_status: "downloading", reading: null }), item("i2")] : [item("i1", { reading: null }), item("i2")]) as never;
    });
    read.mockResolvedValue(reading("fresh"));
    const sleep = vi.fn(async () => {});
    await runMarketDraft("j1", { group, read, sleep });
    expect(sleep).toHaveBeenCalled();
    expect(read).toHaveBeenCalledTimes(1);
  });

  it(`reads at most ${MARKET_DRAFT_MAX_POSTS} posts in one run, the newest (review fix)`, async () => {
    const many = Array.from({ length: MARKET_DRAFT_MAX_POSTS + 10 }, (_, i) =>
      item(`n${i}`, { reading: null, added_at: new Date(Date.UTC(2026, 10, 1) + i * 60_000).toISOString() }));
    vi.mocked(listItems).mockImplementation(async (board) => (board === "bd" ? many : []) as never);
    read.mockResolvedValue(reading("fresh"));
    await runMarketDraft("j1", { group, read, sleep: async () => {} });
    expect(read).toHaveBeenCalledTimes(MARKET_DRAFT_MAX_POSTS);
    expect(read.mock.calls.map((c) => c[0].id)).not.toContain("n0");
    expect(group.mock.calls[0][0]).toHaveLength(MARKET_DRAFT_MAX_POSTS);
  });

  it("tells the grouping the client's signals and the drafts still waiting", async () => {
    vi.mocked(listSignalNames).mockResolvedValue([{ id: "s1", name: "Monsoon rituals" }]);
    vi.mocked(listCopilotMessages).mockResolvedValue([
      { id: "d", role: "assistant", content: "", attachments: [], suggestions: [], createdAt: "",
        card: { kind: "signal-draft", status: "pending", name: "Fast hooks", tags: [], description: "", itemIds: [], thumbs: [], signalId: null } },
    ]);
    await runMarketDraft("j1", { group, read, sleep: async () => {} });
    expect(group.mock.calls[0][2].avoid).toEqual(["Monsoon rituals", "Fast hooks"]);
  });

  it("says so when no pattern holds across two posts, and succeeds", async () => {
    group.mockResolvedValue([]);
    expect(await runMarketDraft("j1", { group, read, sleep: async () => {} })).toEqual({ drafts: 0 });
    const rows = vi.mocked(insertCopilotMessages).mock.calls[0][3];
    expect(rows).toHaveLength(1);
    expect(rows[0].content).toMatch(/could not find a pattern/i);
  });

  it("fails the job and says so when grouping fails", async () => {
    group.mockRejectedValue(new Error("model down"));
    await runMarketDraft("j1", { group, read, sleep: async () => {} });
    expect(failJob).toHaveBeenCalledWith("j1", expect.any(String));
    expect(sayJobFailed).toHaveBeenCalledWith(expect.objectContaining({ kind: "market-draft" }));
  });
});
