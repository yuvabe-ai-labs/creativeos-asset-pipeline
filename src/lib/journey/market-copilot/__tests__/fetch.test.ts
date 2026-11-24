import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/jobs/db", () => ({ getJob: vi.fn(), startJob: vi.fn(), setJobPhase: vi.fn(), succeedJob: vi.fn(), failJob: vi.fn() }));
vi.mock("@/lib/db/moodboards", () => ({ ensureSystemBoards: vi.fn(), listBucketUrls: vi.fn() }));
vi.mock("@/lib/db/copilot-messages", () => ({ insertCopilotMessages: vi.fn(), claimCopilotCard: vi.fn(), getCopilotCard: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
vi.mock("@/lib/journey/thread/opening", () => ({ ensureOpening: vi.fn() }));
vi.mock("@/lib/journey/kb-copilot/job-failed", () => ({ sayJobFailed: vi.fn() }));

import { failJob, getJob, succeedJob } from "@/lib/jobs/db";
import { ensureSystemBoards, listBucketUrls } from "@/lib/db/moodboards";
import { claimCopilotCard, getCopilotCard, insertCopilotMessages } from "@/lib/db/copilot-messages";
import { getClientById } from "@/lib/db/clients";
import { sayJobFailed } from "@/lib/journey/kb-copilot/job-failed";
import type { BrandsCard } from "@/lib/journey/thread/schema";
import { MARKET_POSTS_PER_BRAND } from "../constants";
import { postKey, runMarketFetch } from "../fetch";

// D530 step 2: confirmed brands' recent Instagram posts come in as ordinary references.

const card: BrandsCard = {
  kind: "brands", status: "fetching", focus: null, jobId: "j1",
  brands: [
    { handle: "minimalist", name: "Minimalist", why: "w", group: "direct", keep: true },
    { handle: "sleepyowl", name: "Sleepy Owl", why: "w", group: "adjacent", keep: true },
  ],
};
const post = (handle: string, i: number, day = i) => ({
  shortCode: `${handle}${i}`, type: "Image", caption: `Caption ${i} ${"x".repeat(200)}`,
  url: `https://www.instagram.com/p/${handle}${i}/`, timestamp: `2026-11-${String(10 + day).padStart(2, "0")}T10:00:00Z`,
});
const profile = (handle: string, n: number) => ({ username: handle, followersCount: 10, latestPosts: Array.from({ length: n }, (_, i) => post(handle, i)) });

const ingest = vi.fn();
const fetchProfile = vi.fn();
const run = () => runMarketFetch("j1", { fetchProfile, ingest });
const lastWords = () => {
  const calls = vi.mocked(insertCopilotMessages).mock.calls;
  return calls[calls.length - 1][3][0];
};

beforeEach(() => {
  vi.resetAllMocks();
  process.env.APIFY_TOKEN = "tok";
  vi.mocked(getJob).mockResolvedValue({
    id: "j1", client_id: "c1", created_by: "u1", kind: "market-fetch",
    input: { messageId: "m1", brands: [{ handle: "minimalist", group: "direct" }, { handle: "sleepyowl", group: "adjacent" }] },
  } as never);
  vi.mocked(ensureSystemBoards).mockResolvedValue({ direct: { id: "bd" }, adjacent: { id: "ba" } } as never);
  vi.mocked(listBucketUrls).mockResolvedValue(new Set());
  vi.mocked(getClientById).mockResolvedValue({ id: "c1" } as never);
  vi.mocked(getCopilotCard).mockResolvedValue(card);
  vi.mocked(claimCopilotCard).mockImplementation(async (_c, _m, _k, _f, next) => next as never);
  fetchProfile.mockImplementation(async (handle: string) => profile(handle, 3));
  ingest.mockResolvedValue({ id: "i" });
});

describe("postKey", () => {
  it("is the same for a post however its url is written", () => {
    expect(postKey("https://www.instagram.com/reel/ABC/?igsh=x")).toBe(postKey("https://instagram.com/p/ABC/"));
    expect(postKey("https://www.instagram.com/minimalist/p/ABC/")).toBe(postKey("https://instagram.com/p/ABC"));
  });
});

describe("runMarketFetch", () => {
  it(`adds up to ${MARKET_POSTS_PER_BRAND} posts per brand into its bucket, newest first`, async () => {
    fetchProfile.mockImplementation(async (handle: string) => profile(handle, 14));
    const result = await run();
    expect(result).toEqual({ added: 2 * MARKET_POSTS_PER_BRAND, failed: [] });
    const first = ingest.mock.calls[0][0];
    expect(first).toMatchObject({ boardId: "bd", clientId: "c1", url: "https://www.instagram.com/p/minimalist13/", addedBy: "u1" });
    expect(first.note.startsWith("@minimalist · Caption 13")).toBe(true);
    expect(first.note.length).toBeLessThanOrEqual("@minimalist · ".length + 140);
    expect(ingest.mock.calls.filter((c) => c[0].boardId === "ba")).toHaveLength(MARKET_POSTS_PER_BRAND);
  });

  it("skips a post already saved", async () => {
    vi.mocked(listBucketUrls).mockResolvedValue(new Set(["https://www.instagram.com/reel/minimalist0/?igsh=1"]));
    const result = await run();
    expect(result.added).toBe(5);
    expect(ingest.mock.calls.map((c) => c[0].url)).not.toContain("https://www.instagram.com/p/minimalist0/");
  });

  it("names a brand it could not fetch and keeps the others", async () => {
    fetchProfile.mockImplementation(async (handle: string) => {
      if (handle === "minimalist") throw new Error("HTTP 404");
      return profile(handle, 3);
    });
    const result = await run();
    expect(result).toEqual({ added: 3, failed: ["minimalist"] });
    expect(succeedJob).toHaveBeenCalled();
    expect(lastWords().content).toMatch(/3 posts from 1 brand are in Direct and Adjacent/);
    expect(lastWords().content).toMatch(/@minimalist/);
  });

  it("counts a private profile with no posts as one it could not fetch", async () => {
    fetchProfile.mockImplementation(async (handle: string) => (handle === "sleepyowl" ? { username: handle, followersCount: 1, latestPosts: [] } : profile(handle, 2)));
    expect((await run()).failed).toEqual(["sleepyowl"]);
  });

  it("fails the job when no brand returned posts, and puts the list back for the person", async () => {
    fetchProfile.mockResolvedValue(null);
    const result = await run();
    expect(result).toEqual({ added: 0, failed: ["minimalist", "sleepyowl"] });
    expect(failJob).toHaveBeenCalledWith("j1", expect.any(String));
    expect(succeedJob).not.toHaveBeenCalled();
    // Saying it fails also puts the list back for the person (job-failed.ts).
    expect(sayJobFailed).toHaveBeenCalledWith(expect.objectContaining({ client_id: "c1", kind: "market-fetch", input: expect.objectContaining({ messageId: "m1" }) }));
    expect(claimCopilotCard).not.toHaveBeenCalledWith("c1", "m1", "brands", "fetching", expect.objectContaining({ status: "fetched" }));
  });

  it("moves the card from fetching to fetched and says what came in", async () => {
    vi.mocked(insertCopilotMessages).mockClear();
    fetchProfile.mockImplementation(async (handle: string) => profile(handle, handle === "minimalist" ? 20 : 4));
    await run();
    expect(claimCopilotCard).toHaveBeenCalledWith("c1", "m1", "brands", "fetching", { ...card, status: "fetched" });
    expect(lastWords()).toEqual({
      role: "assistant",
      content: "14 posts from 2 brands are in Direct and Adjacent. Delete any you don't want, then tell me to draft signals.",
      suggestions: ["Draft signals"],
    });
  });

  it("says so when every post was already saved", async () => {
    vi.mocked(listBucketUrls).mockResolvedValue(new Set([0, 1, 2].flatMap((i) => [`https://instagram.com/p/minimalist${i}/`, `https://instagram.com/p/sleepyowl${i}/`])));
    await run();
    expect(ingest).not.toHaveBeenCalled();
    expect(succeedJob).toHaveBeenCalled();
    expect(lastWords().content).toMatch(/No new posts/);
  });
});
