import { describe, it, expect, vi, beforeEach } from "vitest";

type Handler = (payload: unknown) => void;
const registered: { config: Record<string, string>; handler: Handler }[] = [];
const removeChannel = vi.fn();
let onStatus: ((s: string) => void) | null = null;
const channelFactory = vi.fn(() => {
  const ch = {
    on: (_ev: string, config: Record<string, string>, handler: Handler) => {
      registered.push({ config, handler });
      return ch;
    },
    subscribe: (cb?: (s: string) => void) => {
      onStatus = cb ?? null;
      return ch;
    },
  };
  return ch;
});
let resolveSession: () => void = () => {};
const getSession = vi.fn(
  () => new Promise((r) => (resolveSession = () => r({ data: { session: { access_token: "jwt" } } }))),
);

vi.mock("@/lib/supabase/client", () => ({
  createBrowserSupabase: () => ({ auth: { getSession }, channel: channelFactory, removeChannel }),
}));

import { subscribeToNodeGenerationStatus } from "./node-generation-status";

const flush = () => new Promise((r) => setTimeout(r, 0));
const handlers = () => ({ onInsert: vi.fn(), onUpdate: vi.fn(), onSubscribed: vi.fn() });

describe("subscribeToNodeGenerationStatus", () => {
  beforeEach(() => {
    registered.length = 0;
    onStatus = null;
    channelFactory.mockClear();
    removeChannel.mockClear();
    getSession.mockClear();
  });

  // The bug: the channel was opened before the session loaded, so it joined with no JWT and RLS
  // silently dropped the generation's UPDATE — the skeleton stayed up until a page refresh.
  it("opens the channel only once the session has loaded", async () => {
    const off = subscribeToNodeGenerationStatus("n1", handlers());
    await flush();
    expect(getSession).toHaveBeenCalled();
    expect(channelFactory).not.toHaveBeenCalled();

    resolveSession();
    await flush();
    expect(channelFactory).toHaveBeenCalledTimes(1);
    off();
  });

  it("shares one channel per node and routes events and SUBSCRIBED to the first subscriber", async () => {
    const a = handlers();
    const offA = subscribeToNodeGenerationStatus("n2", a);
    const offB = subscribeToNodeGenerationStatus("n2", handlers());
    resolveSession();
    await flush();

    expect(channelFactory).toHaveBeenCalledTimes(1);
    expect(registered.map((r) => r.config)).toEqual([
      expect.objectContaining({ event: "INSERT", table: "generations", filter: "node_id=eq.n2" }),
      expect.objectContaining({ event: "UPDATE", table: "generations", filter: "node_id=eq.n2" }),
    ]);
    registered[1].handler({ new: { status: "succeeded" } });
    expect(a.onUpdate).toHaveBeenCalledWith({ status: "succeeded" });
    onStatus?.("SUBSCRIBED");
    expect(a.onSubscribed).toHaveBeenCalled();

    offA();
    expect(removeChannel).not.toHaveBeenCalled();
    offB();
    expect(removeChannel).toHaveBeenCalledTimes(1);
  });

  it("never opens a channel when every subscriber left before the session loaded", async () => {
    const off = subscribeToNodeGenerationStatus("n3", handlers());
    off();
    resolveSession();
    await flush();
    expect(channelFactory).not.toHaveBeenCalled();
  });
});
