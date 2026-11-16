import { describe, expect, it } from "vitest";
import { liveRefetchInterval, THREAD_IDLE_POLL_MS, THREAD_LIVE_POLL_MS, withPendingMessage } from "../copilot-thread";
import type { ThreadState } from "@/lib/journey/thread/schema";

const state = (over: Partial<ThreadState>): ThreadState => ({ messages: [], live: [], suggestions: ["Start the build"], waiting: null, ...over });

describe("liveRefetchInterval", () => {
  it("does not poll before the thread has loaded", () => {
    expect(liveRefetchInterval(undefined)).toBe(false);
  });
  it("checks slowly when nothing is running, so the form's and a teammate's changes still arrive", () => {
    expect(liveRefetchInterval(state({}))).toBe(THREAD_IDLE_POLL_MS);
    expect(THREAD_IDLE_POLL_MS).toBeGreaterThanOrEqual(15_000);
  });
  it("polls while something is running", () => {
    expect(liveRefetchInterval(state({ live: [{ text: "Reading the website…", state: "running" }] }))).toBe(THREAD_LIVE_POLL_MS);
  });
  it("does not poll fast for a failure that is only being shown", () => {
    expect(liveRefetchInterval(state({ live: [{ text: "Could not study the images.", state: "failed" }] }))).toBe(THREAD_IDLE_POLL_MS);
  });
});

describe("withPendingMessage", () => {
  it("shows the person's message at once, with its attachments, and hides the reply choices", () => {
    const attachment = { kind: "document" as const, id: "0b7d7a0e-6a4f-4c0e-9a55-1f1f8f3a2c11", name: "brand.pdf", url: null };
    const next = withPendingMessage(state({}), { text: "Here you go", attachments: [attachment] });
    expect(next.messages).toHaveLength(1);
    expect(next.messages[0]).toMatchObject({ role: "user", content: "Here you go", attachments: [attachment] });
    expect(next.suggestions).toEqual([]);
  });
});
