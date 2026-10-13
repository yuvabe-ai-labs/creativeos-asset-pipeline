import { describe, it, expect } from "vitest";
import {
  GENERATION_FEED_COLUMNS,
  GENERATION_FEED_ROWS_PER_CHUNK,
  loadGenerationFeed,
  type GenerationFeedClient,
} from "../canvas-feed";

type Call = { columns?: string; ids?: string[]; order?: unknown[]; limit?: number };

function fakeClient(result: (ids: string[]) => { data: unknown; error: unknown }) {
  const calls: Call[] = [];
  const client = {
    from: (table: string) => {
      expect(table).toBe("generations");
      const call: Call = {};
      calls.push(call);
      const q = {
        select: (columns: string) => ((call.columns = columns), q),
        in: (_col: string, ids: string[]) => ((call.ids = ids), q),
        order: (...a: unknown[]) => ((call.order = a), q),
        limit: async (n: number) => ((call.limit = n), result(call.ids ?? [])),
      };
      return q;
    },
  } as unknown as GenerationFeedClient;
  return { client, calls };
}

const ids = (n: number) => Array.from({ length: n }, (_, i) => `n${i}`);

describe("loadGenerationFeed (D366)", () => {
  it("asks for only the feed's columns, newest first and bounded, in chunks of 100 node ids", async () => {
    const { client, calls } = fakeClient((chunk) => ({
      data: [{ id: `g-${chunk[0]}`, node_id: chunk[0] }],
      error: null,
    }));
    const rows = await loadGenerationFeed(client, ids(250));
    expect(calls.map((c) => c.ids!.length)).toEqual([100, 100, 50]);
    for (const c of calls) {
      expect(c.columns).toBe(GENERATION_FEED_COLUMNS);
      expect(c.columns).not.toContain("*");
      expect(c.order).toEqual(["created_at", { ascending: false }]);
      expect(c.limit).toBe(GENERATION_FEED_ROWS_PER_CHUNK);
    }
    expect(rows.map((r) => r.id)).toEqual(["g-n0", "g-n100", "g-n200"]);
  });

  it("fails rather than answering empty when any chunk's read fails", async () => {
    const { client } = fakeClient((chunk) =>
      chunk[0] === "n100" ? { data: null, error: new Error("gateway") } : { data: [], error: null },
    );
    await expect(loadGenerationFeed(client, ids(150))).rejects.toThrow("gateway");
  });
});
