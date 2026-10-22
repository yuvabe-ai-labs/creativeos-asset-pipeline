import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/services/read-json";
import { createAutosaver, SaveFailure, type SaveStatus } from "../autosave";
import type { EditDoc } from "../types";
import { DEFAULT_CAPTION_STYLE } from "../caption-style";

const doc = (shape: EditDoc["shape"] = "9:16"): EditDoc => ({ v: 2, captionStyle: DEFAULT_CAPTION_STYLE, shape, sources: [], pieces: [], captions: [] });

function setup(o: { save?: (d: EditDoc) => Promise<void>; dirty?: boolean } = {}) {
  let current = doc();
  const statuses: SaveStatus[] = [];
  const save = vi.fn(o.save ?? (async () => {}));
  const onLockLost = vi.fn();
  const saver = createAutosaver({
    read: () => ({ doc: current, editable: true }),
    save,
    onStatus: (s) => statuses.push(s),
    onLockLost,
    initiallyDirty: o.dirty ?? false,
  });
  return { saver, save, onLockLost, statuses, edit: (d: EditDoc) => (current = d) };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("the editor's autosave", () => {
  it("saves 800 ms after the last change, once", async () => {
    const t = setup();
    t.edit(doc("16:9"));
    t.saver.schedule();
    t.saver.schedule();
    await vi.advanceTimersByTimeAsync(799);
    expect(t.save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(t.save).toHaveBeenCalledTimes(1);
    expect(t.statuses.at(-1)).toBe("saved");
  });

  it("doesn't call the server when nothing changed", async () => {
    const t = setup();
    await t.saver.flush();
    expect(t.save).not.toHaveBeenCalled();
  });

  it("rejects a flush when the save fails, and keeps retrying in the background", async () => {
    let fail = true;
    const t = setup({ save: async () => { if (fail) throw new ApiError("Server down", 503); } });
    t.edit(doc("16:9"));
    await expect(t.saver.flush()).rejects.toBeInstanceOf(SaveFailure);
    expect(t.statuses.at(-1)).toBe("error");
    fail = false;
    await vi.advanceTimersByTimeAsync(5000);
    expect(t.save).toHaveBeenCalledTimes(2);
    expect(t.statuses.at(-1)).toBe("saved");
  });

  it("hands over on a 409 and rejects, without retrying", async () => {
    const t = setup({ save: async () => { throw new ApiError("Someone else is editing", 409); } });
    t.edit(doc("16:9"));
    await expect(t.saver.flush()).rejects.toMatchObject({ final: true });
    expect(t.onLockLost).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(t.save).toHaveBeenCalledTimes(1);
  });

  it("treats a 400 as final: it never retries a save the server refuses", async () => {
    const t = setup({ save: async () => { throw new ApiError("That edit isn't valid.", 400); } });
    t.edit(doc("16:9"));
    await expect(t.saver.flush()).rejects.toMatchObject({ final: true, message: "That edit isn't valid." });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(t.save).toHaveBeenCalledTimes(1);
  });

  it("saves what is pending when the page goes away", async () => {
    const t = setup();
    t.edit(doc("16:9"));
    t.saver.schedule();
    t.saver.dispose();
    await vi.runAllTimersAsync();
    expect(t.save).toHaveBeenCalledTimes(1);
  });

  it("saves a reconciled edit once on open", async () => {
    const t = setup({ dirty: true });
    t.saver.schedule();
    await vi.advanceTimersByTimeAsync(800);
    expect(t.save).toHaveBeenCalledTimes(1);
    expect(t.saver.isDirty()).toBe(false);
  });
});
