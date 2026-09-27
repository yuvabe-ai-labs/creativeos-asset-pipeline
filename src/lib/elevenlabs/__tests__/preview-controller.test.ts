import { describe, it, expect, vi } from "vitest";
import { createPreviewController } from "../preview-controller";

type Fake = { url: string; pause: ReturnType<typeof vi.fn<() => void>>; ended?: () => void; reject?: (e: unknown) => void };

function fakeAudioFactory() {
  const made: Fake[] = [];
  const factory = (url: string) => {
    const a: Fake = { url, pause: vi.fn<() => void>() };
    made.push(a);
    return {
      play: () => new Promise<void>((_resolve, reject) => { a.reject = reject; }),
      pause: a.pause,
      onEnded: (fn: () => void) => { a.ended = fn; },
    };
  };
  return { factory, made };
}

const A = { voiceId: "a", previewUrl: "https://p/a.mp3" };
const B = { voiceId: "b", previewUrl: "https://p/b.mp3" };

describe("createPreviewController", () => {
  it("starting a preview from one owner stops another owner's preview, and every subscriber sees it", () => {
    const { factory, made } = fakeAudioFactory();
    const c = createPreviewController(factory);
    const seen1: Array<string | null> = [];
    const seen2: Array<string | null> = [];
    c.subscribe((id) => seen1.push(id));
    c.subscribe((id) => seen2.push(id));
    const browser = Symbol("browser");
    const card = Symbol("card");

    c.toggle(browser, A);
    c.toggle(card, B);

    expect(made[0].pause).toHaveBeenCalled();
    expect(c.playingId()).toBe("b");
    expect(seen1.at(-1)).toBe("b");
    expect(seen2.at(-1)).toBe("b");
  });

  it("toggling the playing voice again stops it", () => {
    const { factory } = fakeAudioFactory();
    const c = createPreviewController(factory);
    const me = Symbol();
    c.toggle(me, A);
    c.toggle(me, A);
    expect(c.playingId()).toBeNull();
  });

  it("clears when the current preview ends", () => {
    const { factory, made } = fakeAudioFactory();
    const c = createPreviewController(factory);
    c.toggle(Symbol(), A);
    made[0].ended?.();
    expect(c.playingId()).toBeNull();
  });

  it("a stale ended event or play() rejection from a superseded preview doesn't stop the newer one", async () => {
    const { factory, made } = fakeAudioFactory();
    const c = createPreviewController(factory);
    const me = Symbol();
    c.toggle(me, A);
    c.toggle(me, B);
    made[0].ended?.();
    made[0].reject?.(new Error("aborted"));
    await Promise.resolve();
    expect(c.playingId()).toBe("b");
  });

  it("stop(owner) only stops audio that owner started", () => {
    const { factory } = fakeAudioFactory();
    const c = createPreviewController(factory);
    const browser = Symbol("browser");
    const card = Symbol("card");
    c.toggle(browser, A);
    c.stop(card); // e.g. the card unmounting or its chosen voice changing
    expect(c.playingId()).toBe("a");
    c.stop(browser);
    expect(c.playingId()).toBeNull();
  });

  it("does nothing for a voice without a preview URL, and unsubscribe stops notifications", () => {
    const { factory, made } = fakeAudioFactory();
    const c = createPreviewController(factory);
    const listener = vi.fn();
    const off = c.subscribe(listener);
    off();
    c.toggle(Symbol(), { voiceId: "x", previewUrl: null });
    expect(made).toHaveLength(0);
    expect(listener).not.toHaveBeenCalled();
  });
});
