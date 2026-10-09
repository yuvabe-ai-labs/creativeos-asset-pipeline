import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFrom = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: () => ({ from: mockFrom }) }));
vi.mock("@/lib/db/avatars", () => ({ listAvatars: vi.fn() }));

import { saveGenerateScript, markScriptFinal, claimProposalCard, archiveUnwrittenScript } from "./script-generate";

const SCRIPT_ID = "6f1c2b1e-0000-4000-8000-000000000001";

/** A chain whose calls record themselves and resolve to `result` at maybeSingle(). */
function chain(result: { data: unknown; error: unknown }) {
  const calls: [string, ...unknown[]][] = [];
  const c: Record<string, unknown> = {};
  for (const m of ["update", "eq", "is", "not", "select"]) {
    c[m] = vi.fn((...args: unknown[]) => { calls.push([m, ...args]); return c; });
  }
  c.maybeSingle = vi.fn(async () => result);
  return { c, calls };
}

beforeEach(() => mockFrom.mockReset());

describe("saveGenerateScript", () => {
  it("writes only on the version it read, only at Generate, and bumps the version", async () => {
    const { c, calls } = chain({ data: null, error: null });
    mockFrom.mockReturnValue(c);
    expect(await saveGenerateScript("c1", SCRIPT_ID, 7, { notes: { brief: "", confirmations: [] } })).toBeNull();
    const update = calls.find(([m]) => m === "update")![1] as Record<string, unknown>;
    expect(update.doc_version).toBe(8);
    expect(update.notes).toEqual({ brief: "", confirmations: [] });
    expect(calls).toContainEqual(["eq", "doc_version", 7]);
    expect(calls).toContainEqual(["eq", "stage", "generate"]);
    expect(calls).toContainEqual(["eq", "client_id", "c1"]);
    expect(calls).toContainEqual(["is", "archived_at", null]);
  });
});

describe("markScriptFinal", () => {
  it("moves only a drafted script still at Generate on the checked version", async () => {
    const { c, calls } = chain({ data: { id: SCRIPT_ID }, error: null });
    mockFrom.mockReturnValue(c);
    expect(await markScriptFinal("c1", SCRIPT_ID, 3)).toBe(true);
    expect(calls.find(([m]) => m === "update")![1]).toMatchObject({ stage: "visualise" });
    expect(calls).toContainEqual(["eq", "stage", "generate"]);
    expect(calls).toContainEqual(["eq", "doc_version", 3]);
    expect(calls).toContainEqual(["not", "doc", "is", null]);
  });

  it("reports false when nothing matched (moved on, or already final)", async () => {
    mockFrom.mockReturnValue(chain({ data: null, error: null }).c);
    expect(await markScriptFinal("c1", SCRIPT_ID, 3)).toBe(false);
  });

  it("never queries with a malformed id", async () => {
    expect(await markScriptFinal("c1", "not-a-uuid", 3)).toBe(false);
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

describe("claimProposalCard", () => {
  const card = { kind: "proposal" as const, status: "accepted" as const, summary: "s", ops: [], before: [], after: [] };
  const MSG = "8b3e4d5f-0000-4000-8000-000000000003";

  it("settles a proposal only while it is still pending, so a second accept cannot apply it twice", async () => {
    const { c, calls } = chain({ data: { id: MSG }, error: null });
    mockFrom.mockReturnValue(c);
    expect(await claimProposalCard("c1", SCRIPT_ID, MSG, card)).toBe(true);
    expect(calls.find(([m]) => m === "update")![1]).toEqual({ card });
    expect(calls).toContainEqual(["eq", "card->>status", "pending"]);
    expect(calls).toContainEqual(["eq", "client_id", "c1"]);
  });

  it("reports false when the card was already settled", async () => {
    mockFrom.mockReturnValue(chain({ data: null, error: null }).c);
    expect(await claimProposalCard("c1", SCRIPT_ID, MSG, card)).toBe(false);
  });
});

describe("archiveUnwrittenScript", () => {
  it("archives only this client's script while it is still at Generate with no draft", async () => {
    const { c, calls } = chain({ data: { id: SCRIPT_ID }, error: null });
    mockFrom.mockReturnValue(c);
    expect(await archiveUnwrittenScript("c1", SCRIPT_ID)).toBe(true);
    expect(calls.find(([m]) => m === "update")![1]).toHaveProperty("archived_at");
    expect(calls).toContainEqual(["eq", "id", SCRIPT_ID]);
    expect(calls).toContainEqual(["eq", "client_id", "c1"]);
    expect(calls).toContainEqual(["eq", "stage", "generate"]);
    expect(calls).toContainEqual(["is", "doc", null]);
    expect(calls).toContainEqual(["is", "archived_at", null]);
  });

  it("reports false when nothing matched (drafted, moved on, or already gone)", async () => {
    mockFrom.mockReturnValue(chain({ data: null, error: null }).c);
    expect(await archiveUnwrittenScript("c1", SCRIPT_ID)).toBe(false);
  });

  it("never queries with a malformed id", async () => {
    expect(await archiveUnwrittenScript("c1", "not-a-uuid")).toBe(false);
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
