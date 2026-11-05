import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeScript, SCRIPT_ID } from "@/lib/scripts/visualise/__tests__/fixtures";

// D446 — the one write for products and locations goes the right way for each stage.

vi.mock("server-only", () => ({}));
const db = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  updated: null as Record<string, unknown> | null,
  /** What the conditional update matches: the row, or nothing (someone wrote in between). */
  updateMatches: true,
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: () => {
    const chain = (result: () => unknown) => {
      const q: Record<string, unknown> = {};
      for (const k of ["select", "eq", "is", "in"]) q[k] = () => q;
      q.maybeSingle = async () => result();
      return q;
    };
    return {
      from: () => ({
        select: () => chain(() => ({ data: db.row, error: null })),
        update: (patch: Record<string, unknown>) => {
          db.updated = patch;
          return chain(() => ({ data: db.updateMatches ? { stage: db.row?.stage } : null, error: null }));
        },
      }),
    };
  },
}));
vi.mock("@/lib/db/script-generate", () => ({ changeGenerateScript: vi.fn() }));
vi.mock("@/lib/storage/gcs", () => ({ publicUrlFor: (p: string) => `https://storage.example/${p}` }));

import { changeGenerateScript } from "@/lib/db/script-generate";
import { changeScriptAssets } from "../script-assets";

const doc = makeScript().doc;
const row = (stage: string) => ({
  id: SCRIPT_ID, client_id: "c1", stage, doc, approved_at: null, archived_at: null, created_at: "t", updated_at: "u1",
});
const addPouch = () => ({ op: "add_product" as const, name: "Pouch" });

beforeEach(() => {
  vi.resetAllMocks();
  db.row = null;
  db.updated = null;
  db.updateMatches = true;
});

describe("changeScriptAssets", () => {
  it("at Generate, writes through changeGenerateScript so the doc version moves", async () => {
    db.row = row("generate");
    vi.mocked(changeGenerateScript).mockImplementation(async (_c, _s, change) => {
      const out = change({ doc, notes: { brief: "", confirmations: [] } } as never);
      if ("error" in out) return out;
      return { script: {} as never, result: out.result };
    });
    const r = await changeScriptAssets("c1", SCRIPT_ID, addPouch);
    expect(r.ok && r.stage).toBe("generate");
    expect(r.ok && r.doc.products.map((p) => p.id)).toEqual(["pouch"]);
    expect(db.updated).toBeNull();
  });

  it("at Visualise, writes on updated_at like a cast avatar link", async () => {
    db.row = row("visualise");
    const r = await changeScriptAssets("c1", SCRIPT_ID, addPouch);
    expect(r.ok && r.stage).toBe("visualise");
    expect((db.updated?.doc as typeof doc).products.map((p) => p.id)).toEqual(["pouch"]);
    expect(changeGenerateScript).not.toHaveBeenCalled();
  });

  it("refuses an approved script", async () => {
    db.row = row("approved");
    expect(await changeScriptAssets("c1", SCRIPT_ID, addPouch)).toEqual({
      ok: false, error: "Products and locations can be changed while the script is being written or visualised.", status: 409,
    });
  });

  it("says so when someone else wrote twice in between", async () => {
    db.row = row("in_review");
    db.updateMatches = false;
    expect(await changeScriptAssets("c1", SCRIPT_ID, addPouch)).toEqual({
      ok: false, error: "The script changed at the same time. Try again.", status: 409,
    });
  });

  it("passes the builder's and the op's refusals through", async () => {
    db.row = row("visualise");
    expect(await changeScriptAssets("c1", SCRIPT_ID, () => ({ error: "Nope.", status: 403 }))).toEqual({ ok: false, error: "Nope.", status: 403 });
    expect(await changeScriptAssets("c1", SCRIPT_ID, () => ({ op: "remove_product", productId: "ghost" }))).toEqual({
      ok: false, error: 'There is no product "ghost".', status: 422,
    });
  });
});
