import { describe, expect, it } from "vitest";
import type { ThreadMessage } from "@/lib/journey/thread/schema";
import { walkOf } from "../walk";

const msg = (over: Partial<ThreadMessage>): ThreadMessage =>
  ({ id: "m", role: "assistant", content: "x", card: null, attachments: [], suggestions: [], createdAt: "", ...over });
const q = (field: string) => msg({ card: { kind: "question", field, label: field } });
const built = msg({ card: { kind: "status", lines: [] } });
const note = msg({ card: { kind: "note" } });

describe("walkOf", () => {
  it("a build resets what was asked; only the last message can be a pending question", () => {
    expect(walkOf([q("a"), built, q("b"), msg({ role: "user" }), q("c")])).toEqual({ asked: ["b", "c"], pending: "c" });
    expect(walkOf([q("b"), msg({})]).pending).toBeNull();
    expect(walkOf([q("b"), msg({ role: "user" })]).pending).toBeNull();
  });

  it("counts a field asked twice once", () => {
    expect(walkOf([q("a"), msg({ role: "user" }), msg({}), q("a")])).toEqual({ asked: ["a"], pending: "a" });
  });

  it("looks past notes: a save on the page neither answers a question nor resets the walk", () => {
    expect(walkOf([q("a"), note, note])).toEqual({ asked: ["a"], pending: "a" });
  });

  it("is empty for an empty thread", () => {
    expect(walkOf([])).toEqual({ asked: [], pending: null });
  });
});
