import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createDebounced } from "./debounce";

describe("createDebounced", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("delays the call until the delay elapses with no further calls", () => {
    const fn = vi.fn();
    const d = createDebounced(fn, 200);
    d.call("a");
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(199);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledWith("a");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("resets the timer on every call — only the LAST call's args fire (trailing edge)", () => {
    const fn = vi.fn();
    const d = createDebounced(fn, 200);
    d.call("a");
    vi.advanceTimersByTime(100);
    d.call("b");
    vi.advanceTimersByTime(100);
    expect(fn).not.toHaveBeenCalled(); // only 100ms since "b", not yet 200
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("b");
  });

  it("flush() invokes immediately with the last pending args and clears the timer", () => {
    const fn = vi.fn();
    const d = createDebounced(fn, 200);
    d.call("a");
    d.flush();
    expect(fn).toHaveBeenCalledWith("a");
    expect(fn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(200);
    expect(fn).toHaveBeenCalledTimes(1); // no double-fire after flush
  });

  it("flush() with nothing pending is a no-op", () => {
    const fn = vi.fn();
    const d = createDebounced(fn, 200);
    d.flush();
    expect(fn).not.toHaveBeenCalled();
  });

  it("cancel() clears a pending call without invoking it", () => {
    const fn = vi.fn();
    const d = createDebounced(fn, 200);
    d.call("a");
    d.cancel();
    vi.advanceTimersByTime(200);
    expect(fn).not.toHaveBeenCalled();
  });
});
