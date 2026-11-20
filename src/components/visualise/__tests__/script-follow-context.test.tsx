import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { askingTarget, FollowTarget, targetState } from "../script-follow-context";

describe("the board follows the copilot", () => {
  it("marks what the walk asks about", () => {
    expect(targetState("cast:c1", "cast:c1", new Map(), new Map()).asking).toBe(true);
    expect(targetState("cast:c2", "cast:c1", new Map(), new Map()).asking).toBe(false);
  });

  it("highlights what just landed, with a count that changes per landing", () => {
    const landed = new Map([["shot:s2", { n: 3, until: Date.now() + 4000 }]]);
    const versions = new Map([["shot:s2", 3]]);
    expect(targetState("shot:s2", null, landed, versions)).toMatchObject({ landed: 3, version: 3, writing: false });
    expect(targetState("shot:s1", null, landed, versions)).toMatchObject({ landed: null, version: 0 });
  });

  it("draws a target as plain content where nothing follows the copilot", () => {
    expect(renderToStaticMarkup(<FollowTarget id="cast:c1"><span>Meenakshi</span></FollowTarget>)).toBe("<span>Meenakshi</span>");
  });

  // Final review, Important 2 — the highlight fades without re-mounting the target a second time.
  it("keeps a target's version once its highlight has faded", () => {
    expect(targetState("shot:s2", null, new Map(), new Map([["shot:s2", 3]]))).toMatchObject({ landed: null, version: 3 });
  });

  // Final review, Important 5 — nothing is asked about once the board is with the client.
  it("asks about a cast slot only at Visualise", () => {
    const step = { kind: "cast" as const, castId: "c1", name: "M", drawable: 0 };
    expect(askingTarget(step, "visualise")).toBe("cast:c1");
    expect(askingTarget(step, "in_review")).toBeNull();
    expect(askingTarget({ kind: "send" }, "visualise")).toBeNull();
  });
});
