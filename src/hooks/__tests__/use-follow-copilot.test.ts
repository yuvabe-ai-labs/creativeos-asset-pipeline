import { describe, expect, it } from "vitest";
import { NO_TARGET_ACTIVITY, type TargetActivity } from "@/lib/journey/thread/target-activity";
import { nextMove } from "../use-follow-copilot";

const A = "kb:a.b";
const B = "kb:c.d";
const act = (move: TargetActivity["move"]): TargetActivity => ({ ...NO_TARGET_ACTIVITY, move, n: move?.n ?? 0 });
const all = () => true;

describe("nextMove", () => {
  it("moves on a new move count", () => {
    expect(nextMove({ activity: act({ target: A, n: 3 }), asking: null, seen: 2, opened: true, canShow: all })).toEqual({ target: A, n: 3 });
  });

  it("does not move again for a move already seen", () => {
    expect(nextMove({ activity: act({ target: A, n: 3 }), asking: null, seen: 3, opened: true, canShow: all })).toBeNull();
  });

  it("moves to the asked target once after opening", () => {
    expect(nextMove({ activity: NO_TARGET_ACTIVITY, asking: B, seen: 0, opened: false, canShow: all })).toEqual({ target: B, n: 0 });
    expect(nextMove({ activity: NO_TARGET_ACTIVITY, asking: B, seen: 0, opened: true, canShow: all })).toBeNull();
  });

  it("prefers a new move over the asked target on opening", () => {
    expect(nextMove({ activity: act({ target: A, n: 4 }), asking: B, seen: 0, opened: false, canShow: all })).toEqual({ target: A, n: 4 });
  });

  it("skips a target the page cannot show", () => {
    const none = () => false;
    expect(nextMove({ activity: act({ target: A, n: 3 }), asking: null, seen: 2, opened: true, canShow: none })).toBeNull();
    expect(nextMove({ activity: NO_TARGET_ACTIVITY, asking: B, seen: 0, opened: false, canShow: none })).toBeNull();
  });
});

// ── Review fixes ─────────────────────────────────────────────────────────────

import { addLanded, hasOpened, LANDED_MS, pruneLanded } from "../use-follow-copilot";

describe("landed changes (review fix: a second landing must not strand the first)", () => {
  it("gives each change its own lifetime, and prunes each when its time is up", () => {
    let m = addLanded(new Map(), [{ target: A, n: 1 }], 1000);
    m = addLanded(m, [{ target: B, n: 2 }], 1100);
    expect([...m.keys()]).toEqual([A, B]);
    m = pruneLanded(m, 1000 + LANDED_MS);
    expect([...m.keys()]).toEqual([B]);
    m = pruneLanded(m, 1100 + LANDED_MS);
    expect(m.size).toBe(0);
  });

  it("returns the same map when nothing is due", () => {
    const m = addLanded(new Map(), [{ target: A, n: 1 }], 1000);
    expect(pruneLanded(m, 1001)).toBe(m);
  });
});

describe("hasOpened (review fix: a teammate's question never moves a page already open)", () => {
  it("is open as soon as the thread has loaded, question or not", () => {
    expect(hasOpened(false, undefined)).toBe(false);
    expect(hasOpened(false, null)).toBe(true);
    expect(hasOpened(false, A)).toBe(true);
    expect(hasOpened(true, undefined)).toBe(true);
  });

  it("so a question that appears later does not move the page", () => {
    const opened = hasOpened(false, null);
    expect(nextMove({ activity: NO_TARGET_ACTIVITY, asking: B, seen: 0, opened, canShow: all })).toBeNull();
  });
});
