import { describe, it, expect, vi } from "vitest";
import { buildActorInput, runImportActor } from "./apify";

type Reply = { status?: number; body: unknown };

/** Answers each fetch with the next reply, recording the calls. */
function scriptedFetch(replies: Reply[]) {
  const queue = [...replies];
  return vi.fn(async () => {
    const r = queue.shift() ?? { body: {} };
    const status = r.status ?? 200;
    return { ok: status < 300, status, json: async () => r.body };
  }) as unknown as typeof fetch;
}

const run = (status: string) => ({ body: { data: { id: "run1", status, defaultDatasetId: "ds1" } } });

describe("buildActorInput", () => {
  it("asks Instagram and Facebook for up to 50 posts from the last 3 months", () => {
    expect(buildActorInput("instagram", "https://www.instagram.com/x/")).toMatchObject({
      directUrls: ["https://www.instagram.com/x/"],
      resultsType: "posts",
      resultsLimit: 50,
      onlyPostsNewerThan: "3 months",
    });
    expect(buildActorInput("facebook", "https://www.facebook.com/x/")).toMatchObject({
      startUrls: [{ url: "https://www.facebook.com/x/" }],
      resultsLimit: 50,
      onlyPostsNewerThan: "3 months",
    });
  });

  it("asks the website actor for merged, deduped media without audio", () => {
    expect(buildActorInput("website", "https://chupps.com/")).toMatchObject({
      mergeResponsiveVariants: true,
      dedupeAcrossPages: true,
      includeAudio: false,
    });
  });
});

describe("runImportActor", () => {
  it("starts a run, polls until it finishes, then reads the dataset", async () => {
    const fetchImpl = scriptedFetch([run("RUNNING"), run("RUNNING"), run("SUCCEEDED"), { body: [{ a: 1 }] }]);
    const items = await runImportActor("instagram", "https://www.instagram.com/x/", { token: "tok", fetchImpl });
    expect(items).toEqual([{ a: 1 }]);
    const urls = vi.mocked(fetchImpl).mock.calls.map((c) => String(c[0]));
    expect(urls[0]).toContain("/acts/apify~instagram-scraper/runs");
    expect(urls[1]).toContain("/actor-runs/run1?waitForFinish=60");
    expect(urls[3]).toContain("/datasets/ds1/items");
  });

  it("caps the website actor's billable items", async () => {
    const fetchImpl = scriptedFetch([run("SUCCEEDED"), { body: [] }]);
    await runImportActor("website", "https://chupps.com/", { token: "tok", fetchImpl });
    expect(String(vi.mocked(fetchImpl).mock.calls[0][0])).toContain("maxItems=80");
  });

  it("returns partial rows from a run that did not succeed, throws when there are none", async () => {
    const partial = scriptedFetch([run("TIMED-OUT"), { body: [{ a: 1 }] }]);
    await expect(runImportActor("facebook", "u", { token: "t", fetchImpl: partial })).resolves.toHaveLength(1);
    const empty = scriptedFetch([run("FAILED"), { body: [] }]);
    await expect(runImportActor("facebook", "u", { token: "t", fetchImpl: empty })).rejects.toThrow(/did not finish/);
  });

  it("aborts a run that outlives the deadline", async () => {
    const fetchImpl = scriptedFetch([run("RUNNING"), { body: {} }, { body: [{ a: 1 }] }]);
    await runImportActor("instagram", "u", { token: "t", fetchImpl, deadlineMs: -1 });
    expect(String(vi.mocked(fetchImpl).mock.calls[1][0])).toContain("/actor-runs/run1/abort");
  });

  it("throws when the run cannot start", async () => {
    const fetchImpl = scriptedFetch([{ status: 402, body: {} }]);
    await expect(runImportActor("instagram", "u", { token: "t", fetchImpl })).rejects.toThrow(/HTTP 402/);
  });
});
