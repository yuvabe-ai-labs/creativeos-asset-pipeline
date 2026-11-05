import { describe, it, expect, vi, beforeEach } from "vitest";
import { scriptDocSchema, type Script } from "../schema";
import reel01 from "../fixtures/reel-01.json";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/script-review/bridge", () => ({ getPickedPanels: vi.fn() }));

import { getPickedPanels } from "@/lib/script-review/bridge";
import { loadCurrentStoryboard } from "../storyboard-server";

const doc = scriptDocSchema.parse(reel01);
const script = (stage: Script["stage"] = "approved"): Script => ({
  id: "sc1", clientId: "c1", stage, doc, approvedAt: null, createdAt: "x", updatedAt: "x",
});
const s1 = doc.shots[0].id;
const s2 = doc.shots[1].id;

describe("loadCurrentStoryboard (D385)", () => {
  beforeEach(() => vi.resetAllMocks());

  // The designer may change the storyboard after approval; the canvas takes it as it is now.
  it("reads each shot's current pick, in the script's order", async () => {
    vi.mocked(getPickedPanels).mockResolvedValue({
      [s2]: { takeId: "t2", url: "https://x/p2.png" },
      [s1]: { takeId: "t9", url: "https://x/redrawn.png" },
    });
    expect(await loadCurrentStoryboard(script())).toEqual([
      { label: "S1", beat: doc.shots[0].beat, shotId: s1, url: "https://x/redrawn.png", takeId: "t9" },
      { label: "S2", beat: doc.shots[1].beat, shotId: s2, url: "https://x/p2.png", takeId: "t2" },
    ]);
    expect(getPickedPanels).toHaveBeenCalledWith("sc1");
  });

  it("leaves out a pick for a shot the script no longer has", async () => {
    vi.mocked(getPickedPanels).mockResolvedValue({ gone: { takeId: "t1", url: "https://x/old.png" } });
    expect(await loadCurrentStoryboard(script())).toEqual([]);
  });

  it("is empty for a script that is not approved, without reading panels", async () => {
    expect(await loadCurrentStoryboard(script("in_review"))).toEqual([]);
    expect(getPickedPanels).not.toHaveBeenCalled();
  });

  // A storyboard that cannot be read must not stop the script reaching a canvas: it arrives
  // without one (spec §3).
  it("is empty, not an error, when the panels cannot be read", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(getPickedPanels).mockRejectedValue(new Error("down"));
    await expect(loadCurrentStoryboard(script())).resolves.toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
