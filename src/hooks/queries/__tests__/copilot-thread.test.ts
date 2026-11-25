import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { askedAfterTurn, copilotThreadKeys, finishTurn, liveRefetchInterval, nextSavedEvent, THREAD_IDLE_POLL_MS, THREAD_LIVE_POLL_MS, withPendingMessage } from "../copilot-thread";
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

describe("nextSavedEvent", () => {
  it("counts each save, so the form can tell a new one from one it has already shown", () => {
    const first = nextSavedEvent(null, { website: "https://acme.com/" });
    expect(first).toEqual({ n: 1, website: "https://acme.com/" });
    expect(nextSavedEvent(first, { instagram: "acme" })).toEqual({ n: 2, instagram: "acme" });
  });
  it("leaves the last save in place when a turn saved nothing", () => {
    const first = nextSavedEvent(null, { website: "https://acme.com/" });
    expect(nextSavedEvent(first, {})).toBe(first);
    expect(nextSavedEvent(null, {})).toBeNull();
  });
});
describe("finishTurn", () => {
  it("is not undone by a thread read that started before the reply was stored", async () => {
    const client = new QueryClient();
    const key = copilotThreadKeys.thread("c1");
    const before = state({ suggestions: [] });
    const after = state({ suggestions: ["Start the build"] });
    let land!: (s: ThreadState) => void;
    // A poll in flight: it read the thread before the reply was stored, and lands late.
    const poll = client.fetchQuery({ queryKey: key, queryFn: () => new Promise<ThreadState>((resolve) => { land = resolve; }) });
    await finishTurn(client, key, after);
    land(before);
    await poll.catch(() => {});
    expect(client.getQueryData(key)).toEqual(after);
  });
});

describe("askedAfterTurn (D520)", () => {
  const question = (field: string, id = field) => ({ id, role: "assistant" as const, content: "?", card: { kind: "question" as const, field, label: field }, attachments: [], suggestions: [], createdAt: "" });
  const said = (content: string) => ({ id: content, role: "user" as const, content, card: null, attachments: [], suggestions: [], createdAt: "" });

  it("moves when the waiting target changed", () => {
    const before = state({ messages: [question("a.b")] });
    const after = state({ messages: [question("a.b"), said("30"), question("c.d")] });
    expect(askedAfterTurn(before, after)).toEqual({ type: "asked", target: "kb:c.d" });
  });

  it("does nothing when the same question is asked again", () => {
    const before = state({ messages: [question("a.b")] });
    const after = state({ messages: [question("a.b"), said("what is tone?"), question("a.b", "q2")] });
    expect(askedAfterTurn(before, after)).toBeNull();
  });

  it("does nothing when no question waits after", () => {
    expect(askedAfterTurn(state({ messages: [question("a.b")] }), state({ messages: [question("a.b"), said("stop")] }))).toBeNull();
  });

  it("moves to the first question when there was no thread before", () => {
    expect(askedAfterTurn(undefined, state({ messages: [question("a.b")] }))).toEqual({ type: "asked", target: "kb:a.b" });
  });
});

// ── Review fix: the page's read-only view must not break "refresh the thread now" ──

import { QueryObserver } from "@tanstack/react-query";
import { vi } from "vitest";
import { askingTargetOptions, threadQueryOptions } from "../copilot-thread";
import { copilotThreadService } from "@/services/copilot-thread.service";

describe("the page's read-only view of the thread", () => {
  it("still lets the thread be refreshed when it was the last to render", async () => {
    const thread = vi.spyOn(copilotThreadService, "thread").mockResolvedValue(state({}));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const panel = new QueryObserver(client, threadQueryOptions("c1"));
    const offPanel = panel.subscribe(() => {});
    // The first load has finished: a refresh asked for while it is in flight would just join it.
    await vi.waitFor(() => expect(client.getQueryState(copilotThreadKeys.thread("c1"))?.status).toBe("success"));
    // The page renders after the panel, so its options are the ones the query holds.
    const page = new QueryObserver(client, askingTargetOptions("c1"));
    const offPage = page.subscribe(() => {});
    expect(thread).toHaveBeenCalledTimes(1); // the page itself never fetches
    await client.invalidateQueries({ queryKey: copilotThreadKeys.thread("c1") });
    expect(thread).toHaveBeenCalledTimes(2);
    expect(client.getQueryState(copilotThreadKeys.thread("c1"))?.status).toBe("success");
    offPanel(); offPage(); thread.mockRestore();
  });
});
