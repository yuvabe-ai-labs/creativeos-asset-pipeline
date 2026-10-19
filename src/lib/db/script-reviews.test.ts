import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const mockFrom = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: () => ({ from: mockFrom }),
}));

import { getLatestVersion, listFeedbackCounts } from "./script-reviews";

// A PostgREST builder stand-in: every filter returns the chain, and the chain resolves (awaited, or
// through maybeSingle) to the one answer given.
function answer(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "limit"]) chain[m] = () => chain;
  chain.maybeSingle = async () => result;
  chain.then = (resolve: (r: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return chain;
}

beforeEach(() => mockFrom.mockReset());

describe("getLatestVersion (final review #2)", () => {
  it("throws, rather than reporting no version, when the stored latest version no longer parses", async () => {
    // A frozen doc from before a schema change: skipping it would make the next share diff against
    // nothing and send expectedLatest 0, which the database refuses as stale for ever.
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mockFrom.mockReturnValue(
      answer({
        data: { id: "v3", review_id: "r1", number: 3, scope: "script", doc: { header: {} }, visuals: { avatars: {}, panels: {} }, created_at: "t" },
        error: null,
      }),
    );
    await expect(getLatestVersion("r1")).rejects.toThrow("Version 3 of this review could not be read.");
  });

  it("is null when nothing was shared yet", async () => {
    mockFrom.mockReturnValue(answer({ data: null, error: null }));
    expect(await getLatestVersion("r1")).toBeNull();
  });
});

describe("listFeedbackCounts (final review #3)", () => {
  it("answers no counts, rather than breaking the library, when the review tables cannot be read", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    mockFrom.mockReturnValue(answer({ data: null, error: { code: "PGRST205", message: "Could not find the table" } }));
    expect(await listFeedbackCounts("c1")).toEqual({});
    expect(error).toHaveBeenCalled();
  });

  it("tallies client comments and approvals per script", async () => {
    mockFrom.mockImplementation((table: string) =>
      table === "script_review_comments"
        ? answer({ data: [{ script_reviews: { script_id: "s1" } }, { script_reviews: [{ script_id: "s1" }] }], error: null })
        : answer({ data: [{ script_id: "s1" }, { script_id: "s2" }], error: null }),
    );
    expect(await listFeedbackCounts("c1")).toEqual({ s1: 3, s2: 1 });
  });
});

// The approve function lives in SQL and there is no database in this suite, so this pins the text
// of the migration that redefines it: Approve works on any share's scope (D385, supersedes D350's
// full-share-only rule), and the rest of its checks stay.
describe("script_review_approve (migration 0058)", () => {
  it("approves any share scope, keeping the stale, already and in-review checks", async () => {
    const { readFileSync } = await import("node:fs");
    const sql = readFileSync("supabase/migrations/0058_approve_any_share.sql", "utf8").replace(/\s+/g, " ");
    expect(sql).toMatch(/create or replace function script_review_approve\(/);
    expect(sql).not.toMatch(/'partial'/);
    expect(sql).not.toMatch(/v_scope/);
    for (const status of ["'stale'", "'already'", "'not_in_review'", "'not_found'", "'ok'"]) expect(sql).toContain(status);
  });
});
