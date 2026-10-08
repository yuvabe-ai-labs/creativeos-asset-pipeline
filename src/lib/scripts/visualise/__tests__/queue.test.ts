import { describe, it, expect } from "vitest";
import { runQueue } from "../queue";

const tick = () => new Promise((r) => setTimeout(r, 1));

describe("runQueue (D345)", () => {
  it("runs every item, never more than the limit at once, in order", async () => {
    let running = 0;
    let peak = 0;
    const seen: number[] = [];
    await runQueue([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      running++;
      peak = Math.max(peak, running);
      seen.push(n);
      await tick();
      running--;
    });
    expect(peak).toBe(3);
    expect(seen).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("starts nothing new once told to stop, and lets the running ones finish (the credit cap)", async () => {
    let capped = false;
    const finished: number[] = [];
    const { started } = await runQueue([1, 2, 3, 4, 5, 6], 2, async (n) => {
      await tick();
      if (n === 2) capped = true;
      finished.push(n);
    }, () => capped);
    expect(started).toEqual([1, 2, 3]);
    expect(finished.sort()).toEqual([1, 2, 3]);
  });

  it("keeps going past a failed item", async () => {
    const { started } = await runQueue([1, 2, 3], 1, async (n) => {
      if (n === 2) throw new Error("boom");
    });
    expect(started).toEqual([1, 2, 3]);
  });
});
