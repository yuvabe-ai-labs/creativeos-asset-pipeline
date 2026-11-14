import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ createServerSupabase: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: m.createServerSupabase }));

import { listClientNames } from "./clients";

describe("listClientNames", () => {
  it("reads only id and name of the agency's active clients", async () => {
    const calls: unknown[][] = [];
    const builder: Record<string, unknown> = {};
    for (const name of ["select", "eq", "is", "order"]) {
      builder[name] = (...args: unknown[]) => { calls.push([name, ...args]); return builder; };
    }
    builder.then = (resolve: (v: unknown) => void) => resolve({ data: [{ id: "c1", name: "Chupps" }], error: null });
    m.createServerSupabase.mockReturnValue({ from: (table: string) => { calls.push(["from", table]); return builder; } });

    expect(await listClientNames("org-1")).toEqual([{ id: "c1", name: "Chupps" }]);
    expect(calls).toEqual(expect.arrayContaining([
      ["from", "clients"], ["select", "id, name"], ["eq", "org_id", "org-1"], ["is", "archived_at", null],
    ]));
  });
});
