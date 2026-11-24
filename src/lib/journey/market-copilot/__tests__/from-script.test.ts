import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/copilot-messages", () => ({ insertCopilotMessages: vi.fn(), listCopilotMessages: vi.fn(), claimCopilotCard: vi.fn() }));
vi.mock("@/lib/db/kb", () => ({ getActiveKBVersion: vi.fn() }));
vi.mock("@/lib/db/brand-kit", () => ({ getBrandDetails: vi.fn() }));
vi.mock("@/lib/journey/thread/opening", () => ({ ensureOpening: vi.fn() }));

import { claimCopilotCard, insertCopilotMessages, listCopilotMessages } from "@/lib/db/copilot-messages";
import { getActiveKBVersion } from "@/lib/db/kb";
import { getBrandDetails } from "@/lib/db/brand-kit";
import type { BrandsCard } from "@/lib/journey/thread/schema";
import { askMarketResearch } from "../from-script";

// D532: research asked for inside a script goes to the market research agent, in the onboarding
// thread, as a brands card focused on the question.

const client = { id: "c1", name: "Tamarind & Tide", slug: "tt", org_id: "o1", kb_status: "ready" } as never;
const brands = [{ handle: "minimalist", name: "Minimalist", why: "w", group: "direct" as const, keep: true }];
const findBrands = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(listCopilotMessages).mockResolvedValue([]);
  vi.mocked(getActiveKBVersion).mockResolvedValue(null);
  vi.mocked(getBrandDetails).mockResolvedValue({ instagram: "@tamarindtide" } as never);
  findBrands.mockResolvedValue(brands);
});

describe("askMarketResearch", () => {
  it("puts the question in the onboarding thread, then a brands card focused on it", async () => {
    await askMarketResearch({ client, userId: "u1", scriptTitle: "Reel 4 · Monsoon ritual", question: "what competitors post for monsoon" }, { findBrands });
    expect(findBrands).toHaveBeenCalledWith(expect.objectContaining({ clientName: "Tamarind & Tide", ownHandle: "tamarindtide", focus: "what competitors post for monsoon" }));
    const calls = vi.mocked(insertCopilotMessages).mock.calls;
    expect(calls[0]).toEqual(["c1", "onboarding", "u1", [{ role: "user", content: "From Reel 4 · Monsoon ritual: what competitors post for monsoon" }]]);
    const card = calls[1][3][1].card as BrandsCard;
    expect(card).toEqual({ kind: "brands", status: "pending", focus: "what competitors post for monsoon", brands, jobId: null });
  });

  it("leaves out brands already proposed, and replaces a list still waiting", async () => {
    const older: BrandsCard = { kind: "brands", status: "pending", focus: null, jobId: null, brands: [{ ...brands[0], handle: "sleepyowl" }] };
    vi.mocked(listCopilotMessages).mockResolvedValue([{ id: "m0", role: "assistant", content: "", card: older, attachments: [], suggestions: [], createdAt: "" }]);
    await askMarketResearch({ client, userId: "u1", scriptTitle: "Reel 4", question: "q" }, { findBrands });
    expect(findBrands.mock.calls[0][0].known).toEqual(["sleepyowl"]);
    expect(claimCopilotCard).toHaveBeenCalledWith("c1", "m0", "brands", "pending", { ...older, status: "stale" });
  });

  it("says so in the thread when the search found nobody", async () => {
    findBrands.mockResolvedValue([]);
    await askMarketResearch({ client, userId: "u1", scriptTitle: "Reel 4", question: "q" }, { findBrands });
    const rows = vi.mocked(insertCopilotMessages).mock.calls[1][3];
    expect(rows).toHaveLength(1);
    expect(rows[0].content).toMatch(/could not find brands/i);
  });
});
