import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@trigger.dev/sdk", () => ({ tasks: { trigger: vi.fn() } }));
vi.mock("@/lib/jobs/db", () => ({ insertJob: vi.fn(), setJobRunId: vi.fn(), failJob: vi.fn() }));
vi.mock("@/lib/db/copilot-messages", () => ({ claimCopilotCard: vi.fn() }));

import { tasks } from "@trigger.dev/sdk";
import { failJob, insertJob, setJobRunId } from "@/lib/jobs/db";
import { claimCopilotCard } from "@/lib/db/copilot-messages";
import { JobLockedError } from "@/lib/jobs/types";
import type { BrandsCard } from "@/lib/journey/thread/schema";
import { confirmBrands, startMarketJob } from "../start";

// D530: a market job starts only after a person confirmed, once, and one market job runs at a time.

const client = { id: "c1", org_id: "o1" };
const card: BrandsCard = {
  kind: "brands", status: "pending", focus: null, jobId: null,
  brands: [
    { handle: "minimalist", name: "Minimalist", why: "w", group: "direct", keep: true },
    { handle: "sleepyowl", name: "Sleepy Owl", why: "w", group: "adjacent", keep: true },
  ],
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(insertJob).mockResolvedValue({ id: "j1" } as never);
  vi.mocked(tasks.trigger).mockResolvedValue({ id: "run1" } as never);
  vi.mocked(claimCopilotCard).mockImplementation(async (_c, _m, _k, _from, next) => next as never);
});

describe("startMarketJob", () => {
  it("queues the job under the client's one market lock and triggers its task", async () => {
    const id = await startMarketJob({ client, userId: "u1", kind: "market-draft", input: { focus: null }, phase: "Reading the posts…" });
    expect(id).toBe("j1");
    expect(insertJob).toHaveBeenCalledWith({
      orgId: "o1", clientId: "c1", kind: "market-draft", input: { focus: null },
      lockKey: "market:c1", phaseMessage: "Reading the posts…", createdBy: "u1",
    });
    expect(tasks.trigger).toHaveBeenCalledWith("market-draft", { jobId: "j1" });
    expect(setJobRunId).toHaveBeenCalledWith("j1", "run1");
  });

  it("fails its job and throws when the task cannot be queued", async () => {
    vi.mocked(tasks.trigger).mockRejectedValue(new Error("down"));
    await expect(startMarketJob({ client, userId: "u1", kind: "market-fetch", input: { messageId: "m1", brands: [] }, phase: "x" })).rejects.toThrow();
    expect(failJob).toHaveBeenCalledWith("j1", expect.any(String));
  });
});

describe("confirmBrands", () => {
  it("fetches only the brands kept, once the card moved to fetching", async () => {
    const r = await confirmBrands({ client, userId: "u1", messageId: "m1", card, keep: ["sleepyowl"] });
    expect(r).toEqual({ status: "started", jobId: "j1" });
    const claimed = vi.mocked(claimCopilotCard).mock.calls[0];
    expect(claimed.slice(0, 4)).toEqual(["c1", "m1", "brands", "pending"]);
    expect(claimed[4]).toMatchObject({ status: "fetching", brands: [{ handle: "minimalist", keep: false }, { handle: "sleepyowl", keep: true }] });
    expect(vi.mocked(insertJob).mock.calls[0][0]).toMatchObject({
      kind: "market-fetch", input: { messageId: "m1", brands: [{ handle: "sleepyowl", group: "adjacent" }] },
      phaseMessage: "Bringing in posts from 1 brand…",
    });
  });

  it("confirms once: the second caller starts no job", async () => {
    vi.mocked(claimCopilotCard).mockResolvedValue(null);
    expect(await confirmBrands({ client, userId: "u1", messageId: "m1", card })).toEqual({ status: "moved" });
    expect(insertJob).not.toHaveBeenCalled();
  });

  it("starts nothing when no brand is kept", async () => {
    expect(await confirmBrands({ client, userId: "u1", messageId: "m1", card, keep: [] })).toEqual({ status: "none" });
    expect(claimCopilotCard).not.toHaveBeenCalled();
  });

  it("puts the card back when another market job is running", async () => {
    vi.mocked(insertJob).mockRejectedValue(new JobLockedError("market:c1"));
    expect(await confirmBrands({ client, userId: "u1", messageId: "m1", card })).toEqual({ status: "running" });
    const back = vi.mocked(claimCopilotCard).mock.calls[1];
    expect(back.slice(0, 4)).toEqual(["c1", "m1", "brands", "fetching"]);
    expect(back[4]).toMatchObject({ status: "pending" });
  });
});
