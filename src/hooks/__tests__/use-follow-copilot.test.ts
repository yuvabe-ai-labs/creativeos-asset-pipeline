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
