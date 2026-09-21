import { describe, it, expect } from "vitest";
import { planMentionables, resolvePlanMentions, LOOK_MENTION_ID } from "../plan-mentions";
import type { MultishotCut } from "../multishot-cuts";

const cuts: MultishotCut[] = [
  { id: "c1", text: "keys", seconds: 2 },
  { id: "c2", text: "cab", seconds: 2 },
  { id: "c3", text: "street", seconds: 4 },
];

describe("planMentionables", () => {
  it("offers the look first, then every shot in ladder order", () => {
    expect(planMentionables(cuts)).toEqual([
      { id: LOOK_MENTION_ID, label: "Look & atmosphere", type: "look" },
      { id: "c1", label: "Shot 1", type: "shot" },
      { id: "c2", label: "Shot 2", type: "shot" },
      { id: "c3", label: "Shot 3", type: "shot" },
    ]);
  });

  // The label is what the operator sees on the card; the cutId is a uuid they never see. Binding
  // on the id means renumbering the ladder cannot move an existing mention onto a different shot.
  it("labels by position but binds by cutId", () => {
    const [, first] = planMentionables(cuts);
    expect(first.label).toBe("Shot 1");
    expect(first.id).toBe("c1");
  });

  it("still offers the look when there are no shots yet", () => {
    expect(planMentionables([])).toEqual([
      { id: LOOK_MENTION_ID, label: "Look & atmosphere", type: "look" },
    ]);
  });

  // A cut can never collide with the look's id, or a mention would resolve to the wrong thing.
  it("uses a look id no cut can take", () => {
    expect(LOOK_MENTION_ID).toContain(":");
  });
});

describe("resolvePlanMentions", () => {
  it("resolves a shot mention to its position AND its cutId", () => {
    // Position keeps the sentence readable; the cutId makes it unambiguous against the shot list
    // already in the turn, which is keyed by cutId.
    expect(resolvePlanMentions("make @[Shot 2](c2) tighter", cuts)).toBe(
      "make Shot 2 (cutId: c2) tighter",
    );
  });

  it("resolves the look mention to a phrase the writer already knows", () => {
    expect(resolvePlanMentions(`@[Look & atmosphere](${LOOK_MENTION_ID}) colder`, cuts)).toBe(
      "the LOOK block colder",
    );
  });

  it("resolves several mentions in one note", () => {
    const out = resolvePlanMentions(
      `@[Shot 1](c1) and @[Shot 3](c3) should match`,
      cuts,
    );
    expect(out).toBe("Shot 1 (cutId: c1) and Shot 3 (cutId: c3) should match");
  });

  // A cut deleted after the note was typed. Dropping the token would delete half the operator's
  // sentence; the bare label keeps what they meant, just less precisely.
  it("degrades an unknown id to its label rather than dropping it", () => {
    expect(resolvePlanMentions("match @[Shot 9](gone) please", cuts)).toBe(
      "match Shot 9 please",
    );
  });

  it("renumbers against the CURRENT ladder, not the label", () => {
    // The note said "Shot 3" when it was typed; c3 is now second. The cutId wins.
    const shorter: MultishotCut[] = [
      { id: "c1", text: "keys", seconds: 2 },
      { id: "c3", text: "street", seconds: 4 },
    ];
    expect(resolvePlanMentions("@[Shot 3](c3) tighter", shorter)).toBe(
      "Shot 2 (cutId: c3) tighter",
    );
  });

  it("leaves a note with no mentions untouched", () => {
    expect(resolvePlanMentions("just make it tighter", cuts)).toBe("just make it tighter");
    expect(resolvePlanMentions("", cuts)).toBe("");
  });
});
