import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ createServerSupabase: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: m.createServerSupabase }));

import { listClientNames } from "./clients";

describe("listClientNames", () => {
  it("reads only id, name, slug and logo of the agency's active clients, in one query", async () => {
    const calls: unknown[][] = [];
    const builder: Record<string, unknown> = {};
    for (const name of ["select", "eq", "is", "order"]) {
      builder[name] = (...args: unknown[]) => { calls.push([name, ...args]); return builder; };
    }
    const row = { id: "c1", name: "Chupps", slug: "chupps", logo_url: "https://cdn.example/chupps.png" };
    builder.then = (resolve: (v: unknown) => void) => resolve({ data: [row], error: null });
    m.createServerSupabase.mockReturnValue({ from: (table: string) => { calls.push(["from", table]); return builder; } });

    expect(await listClientNames("org-1")).toEqual([row]);
    expect(calls).toEqual(expect.arrayContaining([
      ["from", "clients"], ["select", "id, name, slug, logo_url"], ["eq", "org_id", "org-1"], ["is", "archived_at", null],
    ]));
    expect(calls.filter((c) => c[0] === "from")).toHaveLength(1);
  });
});
