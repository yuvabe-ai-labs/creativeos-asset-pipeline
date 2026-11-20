import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FollowTarget, targetState } from "../script-follow-context";

describe("the board follows the copilot", () => {
  it("marks what the walk asks about", () => {
    expect(targetState("cast:c1", "cast:c1", new Map()).asking).toBe(true);
    expect(targetState("cast:c2", "cast:c1", new Map()).asking).toBe(false);
  });

  it("highlights what just landed, with a count that changes per landing", () => {
    const landed = new Map([["shot:s2", { n: 3, until: Date.now() + 4000 }]]);
    expect(targetState("shot:s2", null, landed)).toMatchObject({ landed: 3, version: 3, writing: false });
    expect(targetState("shot:s1", null, landed)).toMatchObject({ landed: null, version: 0 });
  });

  it("draws a target as plain content where nothing follows the copilot", () => {
    expect(renderToStaticMarkup(<FollowTarget id="cast:c1"><span>Meenakshi</span></FollowTarget>)).toBe("<span>Meenakshi</span>");
  });
});
