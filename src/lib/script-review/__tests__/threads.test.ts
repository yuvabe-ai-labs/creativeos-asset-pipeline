// src/lib/script-review/__tests__/threads.test.ts
import { describe, it, expect } from "vitest";
import { approveConfirmText, buildThreads, openThreads, placeThreads, removedShots } from "../threads";
import { partKey } from "../parts";
import { comment, reelDoc } from "./fixtures";

const at = (minute: number) => `2026-10-10T10:${String(minute).padStart(2, "0")}:00.000Z`;

describe("buildThreads", () => {
  it("puts replies under their comment, oldest first, and reads Resolved off the first comment", () => {
    const threads = buildThreads([
      comment({ id: "r2", parentId: "a", authorKind: "team", authorName: "Arun", createdAt: at(5) }),
      comment({ id: "a", createdAt: at(1), resolvedAt: at(9), resolvedByName: "Arun" }),
      comment({ id: "b", createdAt: at(2) }),
      comment({ id: "r1", parentId: "a", authorKind: "team", authorName: "Arun", createdAt: at(3) }),
    ]);
    expect(threads.map((t) => t.root.id)).toEqual(["a", "b"]);
    expect(threads[0].replies.map((r) => r.id)).toEqual(["r1", "r2"]);
    expect(threads[0].resolved).toBe(true);
    expect(threads[1].resolved).toBe(false);
  });
});

describe("placeThreads", () => {
  it("puts a thread beside its part", () => {
    const threads = buildThreads([comment({ id: "a", part: { kind: "shot", shotId: "s04" } })]);
    const placed = placeThreads(threads, reelDoc(), {});
    expect(placed.byPart.get(partKey({ kind: "shot", shotId: "s04" }))?.map((t) => t.root.id)).toEqual(["a"]);
    expect(placed.removed).toEqual([]);
  });

  it("keeps a thread on a removed shot, under that shot's last text (spec 4 §5)", () => {
    const doc = reelDoc();
    doc.shots = doc.shots.filter((s) => s.id !== "s09");
    const threads = buildThreads([
      comment({ id: "a", part: { kind: "shot", shotId: "s09" } }),
      comment({ id: "b", part: { kind: "panel", shotId: "s09" }, createdAt: at(4) }),
    ]);
    const placed = placeThreads(threads, doc, { s09: { label: "S9", text: "She smiles at the Golu steps" } });
    expect(placed.byPart.size).toBe(0);
    expect(placed.removed).toHaveLength(1);
    expect(placed.removed[0]).toMatchObject({ shotId: "s09", label: "S9", text: "She smiles at the Golu steps" });
    expect(placed.removed[0].threads.map((t) => t.root.id)).toEqual(["a", "b"]);
  });

  it("leaves a split's first half with its comments, because it keeps the shot's id", () => {
    const doc = reelDoc();
    doc.shots.splice(5, 0, { ...doc.shots[4], id: "s05b" });
    const placed = placeThreads(buildThreads([comment({ part: { kind: "shot", shotId: "s05" } })]), doc, {});
    expect(placed.byPart.has(partKey({ kind: "shot", shotId: "s05" }))).toBe(true);
    expect(placed.removed).toEqual([]);
  });
});

describe("removedShots", () => {
  it("quotes each gone shot's text from the last version that had it", () => {
    const v1 = reelDoc();
    const v2 = reelDoc();
    v2.shots[8].visual = "Revised S9";
    const now = reelDoc();
    now.shots = now.shots.filter((s) => s.id !== "s09");
    expect(removedShots([{ doc: v1 }, { doc: v2 }], now)).toEqual({ s09: { label: "S9", text: "Revised S9" } });
  });
});

describe("approveConfirmText (spec 4 §8)", () => {
  it("is null when every thread is resolved", () => {
    const threads = buildThreads([comment({ resolvedAt: at(5) })]);
    expect(approveConfirmText(openThreads(threads))).toBeNull();
  });

  it("names the one open comment", () => {
    const threads = buildThreads([comment({ body: "Can she wear blue?" })]);
    expect(approveConfirmText(openThreads(threads))).toBe("You have 1 open comment: “Can she wear blue?”. Approve anyway?");
  });

  it("names three and counts the rest", () => {
    const threads = buildThreads([1, 2, 3, 4].map((n) => comment({ id: `c${n}`, body: `Note ${n}`, createdAt: at(n) })));
    expect(approveConfirmText(openThreads(threads))).toBe(
      "You have 4 open comments: “Note 1”, “Note 2”, “Note 3” and 1 more. Approve anyway?",
    );
  });

  it("shortens a long comment", () => {
    const text = approveConfirmText(openThreads(buildThreads([comment({ body: "x".repeat(200) })])));
    expect(text!.length).toBeLessThan(140);
    expect(text).toContain("…");
  });
});
