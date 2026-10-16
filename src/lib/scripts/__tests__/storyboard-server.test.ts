import { describe, it, expect, vi, beforeEach } from "vitest";
import { scriptDocSchema, type Script } from "../schema";
import reel01 from "../fixtures/reel-01.json";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/script-reviews", () => ({ getScriptReviewForScript: vi.fn(), getLatestVersion: vi.fn() }));

import { getLatestVersion, getScriptReviewForScript } from "@/lib/db/script-reviews";
import { loadApprovedStoryboard } from "../storyboard-server";

const doc = scriptDocSchema.parse(reel01);
const script = (stage: Script["stage"] = "approved"): Script => ({
  id: "sc1", clientId: "c1", stage, doc, approvedAt: null, createdAt: "x", updatedAt: "x",
});
const s1 = doc.shots[0].id;

describe("loadApprovedStoryboard", () => {
  beforeEach(() => vi.resetAllMocks());

  it("reads the panels frozen in the latest (approved) version", async () => {
    vi.mocked(getScriptReviewForScript).mockResolvedValue({ id: "r1" } as never);
    vi.mocked(getLatestVersion).mockResolvedValue({
      visuals: { avatars: {}, panels: { [s1]: { takeId: "t1", url: "https://x/p.png" } } },
    } as never);
    expect(await loadApprovedStoryboard(script())).toEqual([
      { label: "S1", beat: doc.shots[0].beat, shotId: s1, url: "https://x/p.png" },
    ]);
    expect(getLatestVersion).toHaveBeenCalledWith("r1");
  });

  it("is empty for a script that is not approved, without reading reviews", async () => {
    expect(await loadApprovedStoryboard(script("in_review"))).toEqual([]);
    expect(getScriptReviewForScript).not.toHaveBeenCalled();
  });

  // Final review — getLatestVersion throws on a frozen version it cannot read; that must not stop
  // the script reaching a canvas. Unreadable reads as "no storyboard" (spec §3).
  it("is empty, not an error, when the approved version cannot be read", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(getScriptReviewForScript).mockResolvedValue({ id: "r1" } as never);
    vi.mocked(getLatestVersion).mockRejectedValue(new Error("Version 3 of this review could not be read."));
    await expect(loadApprovedStoryboard(script())).resolves.toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("is empty when the script was never shared, or its version froze no panels", async () => {
    vi.mocked(getScriptReviewForScript).mockResolvedValue(null);
    expect(await loadApprovedStoryboard(script())).toEqual([]);
    vi.mocked(getScriptReviewForScript).mockResolvedValue({ id: "r1" } as never);
    vi.mocked(getLatestVersion).mockResolvedValue({ visuals: { avatars: {}, panels: {} } } as never);
    expect(await loadApprovedStoryboard(script())).toEqual([]);
  });
});
