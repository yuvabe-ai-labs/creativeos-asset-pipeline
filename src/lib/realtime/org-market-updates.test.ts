import { describe, it, expect, vi, beforeEach } from "vitest";

// A minimal fake of the supabase browser client: records the postgres_changes
// registration so the test can both assert the filter and fire events into it.
type Handler = (payload: unknown) => void;
const registered: { config: Record<string, string>; handler: Handler }[] = [];
const removeChannel = vi.fn();
const channelFactory = vi.fn((_name: string) => {
  const ch = {
    on: (_ev: string, config: Record<string, string>, handler: Handler) => {
      registered.push({ config, handler });
      return ch;
    },
    subscribe: () => ch,
  };
  return ch;
});

vi.mock("@/lib/supabase/client", () => ({
  createBrowserSupabase: () => ({
    auth: { getSession: async () => ({ data: { session: null } }) },
    channel: channelFactory,
    removeChannel,
  }),
}));

import { moodboardIdFromPayload, subscribeToOrgMarketUpdates } from "./org-market-updates";

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("moodboardIdFromPayload", () => {
  it("reads new first (INSERT / UPDATE)", () => {
    expect(moodboardIdFromPayload({ new: { moodboard_id: "b1" }, old: {} })).toBe("b1");
  });

  it("falls back to old (DELETE)", () => {
    expect(moodboardIdFromPayload({ new: {}, old: { moodboard_id: "b2" } })).toBe("b2");
  });

  // Supabase sends `{}` for the unused side, not null — a `??` chain would not fall
  // through, so the helper must check each side explicitly.
  it("returns null when neither side identifies a row", () => {
    expect(moodboardIdFromPayload({ new: {}, old: {} })).toBeNull();
    expect(moodboardIdFromPayload({})).toBeNull();
  });
});

describe("subscribeToOrgMarketUpdates", () => {
  beforeEach(() => {
    registered.length = 0;
    channelFactory.mockClear();
    removeChannel.mockClear();
  });

  it("filters on org_id explicitly and fans one event out to every listener", async () => {
    const a = vi.fn();
    const b = vi.fn();
    const offA = subscribeToOrgMarketUpdates("org-1", a);
    const offB = subscribeToOrgMarketUpdates("org-1", b);
    await flush();

    expect(channelFactory).toHaveBeenCalledTimes(1);
    expect(registered[0].config).toMatchObject({
      table: "moodboard_items",
      filter: "org_id=eq.org-1",
      event: "*",
    });

    registered[0].handler({ new: { moodboard_id: "b1" }, old: {} });
    expect(a).toHaveBeenCalledWith("b1");
    expect(b).toHaveBeenCalledWith("b1");

    offA();
    expect(removeChannel).not.toHaveBeenCalled();
    offB();
    expect(removeChannel).toHaveBeenCalledTimes(1);
  });
});
