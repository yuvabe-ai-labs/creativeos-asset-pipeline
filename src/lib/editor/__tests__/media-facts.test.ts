import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { ensureMediaFacts } from "../media-facts";
import type { MediaFacts } from "../types";
import { videoFacts } from "./fixtures";

const OWN = "https://storage.googleapis.com/bucket/";
function deps(cached: Record<string, MediaFacts> = {}, failing: string[] = []) {
  return {
    list: vi.fn(async (urls: string[]) => new Map(urls.filter((u) => cached[u]).map((u) => [u, cached[u]]))),
    save: vi.fn(async (_rows: Array<{ url: string; facts: MediaFacts }>) => {}),
    probe: vi.fn(async (url: string) => {
      if (failing.includes(url)) throw new Error("404");
      return videoFacts();
    }),
    isOwn: (url: string) => url.startsWith(OWN),
  };
}

describe("ensureMediaFacts", () => {
  it("does not probe cached urls", async () => {
    const d = deps({ [`${OWN}a.mp4`]: videoFacts({ frames: 72 }) });
    const out = await ensureMediaFacts([`${OWN}a.mp4`], d);
    expect(out.get(`${OWN}a.mp4`)?.video?.frames).toBe(72);
    expect(d.probe).not.toHaveBeenCalled();
    expect(d.save).not.toHaveBeenCalled();
  });

  it("probes and saves new urls in one call", async () => {
    const d = deps();
    const out = await ensureMediaFacts([`${OWN}a.mp4`, `${OWN}b.mp4`], d);
    expect(out.size).toBe(2);
    expect(d.save).toHaveBeenCalledTimes(1);
    expect(d.save.mock.calls[0][0]).toHaveLength(2);
  });

  it("a failed probe returns null and is not cached", async () => {
    const d = deps({}, [`${OWN}gone.mp4`]);
    const out = await ensureMediaFacts([`${OWN}gone.mp4`, `${OWN}ok.mp4`], d);
    expect(out.get(`${OWN}gone.mp4`)).toBeNull();
    expect(d.save.mock.calls[0][0].map((r: { url: string }) => r.url)).toEqual([`${OWN}ok.mp4`]);
  });

  it("never probes a url that isn't ours", async () => {
    const d = deps();
    const out = await ensureMediaFacts(["https://evil.example/x.mp4"], d);
    expect(out.get("https://evil.example/x.mp4")).toBeNull();
    expect(d.probe).not.toHaveBeenCalled();
  });

  it("probes a duplicate once", async () => {
    const d = deps();
    await ensureMediaFacts([`${OWN}a.mp4`, `${OWN}a.mp4`], d);
    expect(d.probe).toHaveBeenCalledTimes(1);
  });
});
