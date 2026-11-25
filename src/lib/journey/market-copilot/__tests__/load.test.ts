import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/moodboards", () => ({ countBucketItems: vi.fn() }));
vi.mock("@/lib/db/signals", () => ({ listSignalNames: vi.fn() }));
vi.mock("@/lib/jobs/db", () => ({ listRecentJobs: vi.fn() }));

import { countBucketItems } from "@/lib/db/moodboards";
import { listSignalNames } from "@/lib/db/signals";
import { listRecentJobs } from "@/lib/jobs/db";
import { loadMarketContext } from "../load";

// D530: what the copilot knows about market research, read once per screen (never per reference).

const NOW = Date.parse("2026-11-24T12:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const client = { id: "c1", market_status: "pending" } as never;
const job = (kind: string, status: string, createdMs: number, updatedMs = createdMs) =>
  ({ id: kind, kind, status, phase_message: `${kind} line`, created_at: ago(createdMs), updated_at: ago(updatedMs) }) as never;

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(countBucketItems).mockResolvedValue({ direct: 3, adjacent: 1 });
  vi.mocked(listSignalNames).mockResolvedValue([{ id: "s1", name: "Monsoon rituals" }]);
  vi.mocked(listRecentJobs).mockResolvedValue([]);
});

describe("loadMarketContext", () => {
  it("reads the counts and the signal names", async () => {
    expect(await loadMarketContext(client, NOW)).toEqual({
      open: true, status: "pending", counts: { direct: 3, adjacent: 1, signals: 1 }, signalNames: ["Monsoon rituals"],
      pendingBrands: null, job: null, ownHandle: null,
    });
  });

  it("keeps the newer of the two market jobs", async () => {
    vi.mocked(listRecentJobs).mockImplementation(async (_c, kind) =>
      (kind === "market-fetch" ? [job("market-fetch", "succeeded", 600_000)] : [job("market-draft", "running", 60_000)]) as never);
    expect((await loadMarketContext(client, NOW)).job).toEqual({ kind: "market-draft", status: "running", phaseMessage: "market-draft line" });
  });

  it("does not show a job that stopped reporting as running", async () => {
    vi.mocked(listRecentJobs).mockImplementation(async (_c, kind) =>
      (kind === "market-fetch" ? [job("market-fetch", "running", 3 * 3_600_000)] : []) as never);
    expect((await loadMarketContext(client, NOW)).job?.status).toBe("stopped");
  });
});
