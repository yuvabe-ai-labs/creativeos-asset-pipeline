import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AvatarRow } from "@/lib/avatars/rows";

const mockFrom = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: () => ({ from: mockFrom }),
}));

import { getAvatar, updateAvatar, archiveAvatar } from "./avatars";

beforeEach(() => mockFrom.mockReset());

const VALID_ID = "2b1b1b1b-1b1b-4b1b-8b1b-1b1b1b1b1b1b";

const ROW: AvatarRow = {
  id: VALID_ID,
  client_id: "c1",
  name: "Riya",
  story: "",
  person_type: "specific",
  likeness_consent_by: null,
  likeness_consent_at: null,
  front: null,
  sheet: null,
  sheet_stale: false,
  voice: null,
  voice_sample: null,
  status: "draft",
  archived_at: null,
  created_at: "2026-09-30T00:00:00.000Z",
  updated_at: "2026-09-30T00:00:00.000Z",
};

// A minimal stand-in for the chainable PostgrestFilterBuilder: `.update()`, `.eq()` and
// `.select()` all return the same chain (mirroring the real client's `this`-returning filters),
// and every `.eq()` call is recorded so the test can assert which filters were applied.
type UpdateChain = {
  eq: (column: string, value: unknown) => UpdateChain;
  is: (column: string, value: null) => UpdateChain;
  select: (columns: string) => UpdateChain;
  maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
};

function makeUpdateChain(result: { data: unknown; error: unknown }) {
  const eqCalls: [string, unknown][] = [];
  const isCalls: [string, unknown][] = [];
  const chain: UpdateChain = {
    eq: vi.fn((column: string, value: unknown) => {
      eqCalls.push([column, value]);
      return chain;
    }),
    is: vi.fn((column: string, value: null) => {
      isCalls.push([column, value]);
      return chain;
    }),
    select: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => result),
  };
  return { chain, eqCalls, isCalls };
}

// Postgres throws on a non-UUID id; getAvatar/updateAvatar/archiveAvatar treat a malformed id
// as "not found" without ever querying — see the guard comment in ./avatars.ts.
describe("malformed id guard", () => {
  it("getAvatar resolves null for a non-UUID id, without querying", async () => {
    await expect(getAvatar("c1", "abc")).resolves.toBeNull();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("updateAvatar resolves null for a non-UUID id, without querying", async () => {
    await expect(updateAvatar("c1", "abc", {})).resolves.toBeNull();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("archiveAvatar resolves false for a non-UUID id, without querying", async () => {
    await expect(archiveAvatar("c1", "abc")).resolves.toBe(false);
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

// D289 amended — closing the read-then-write window: the write itself must fail, rather than
// silently land on a different photo, when the front image changed after the route read it.
describe("updateAvatar — front-image precondition", () => {
  it("adds a front->>url filter when ifFrontUrl is given", async () => {
    const { chain, eqCalls } = makeUpdateChain({ data: ROW, error: null });
    mockFrom.mockReturnValue({ update: vi.fn(() => chain) });

    await updateAvatar("c1", VALID_ID, { name: "x" }, { ifFrontUrl: "https://img/face.png" });

    expect(eqCalls).toContainEqual(["front->>url", "https://img/face.png"]);
  });

  it("omits the filter when no precondition is given", async () => {
    const { chain, eqCalls } = makeUpdateChain({ data: ROW, error: null });
    mockFrom.mockReturnValue({ update: vi.fn(() => chain) });

    await updateAvatar("c1", VALID_ID, { name: "x" });

    expect(eqCalls.some(([column]) => column === "front->>url")).toBe(false);
  });

  it("resolves null when the precondition matches no row", async () => {
    const { chain } = makeUpdateChain({ data: null, error: null });
    mockFrom.mockReturnValue({ update: vi.fn(() => chain) });

    const result = await updateAvatar(
      "c1", VALID_ID, { likenessConsentBy: "u1" }, { ifFrontUrl: "https://img/face.png" },
    );

    expect(result).toBeNull();
  });

  // The "front is still empty" form (D291 amended) — a first front pick on a new draft has no
  // existing front URL to compare against, so the precondition is expressed as a null check on
  // the whole jsonb column instead of a text-path equality.
  it("adds an is-null filter on front when ifFrontUrl is null, instead of a text-path filter", async () => {
    const { chain, eqCalls, isCalls } = makeUpdateChain({ data: ROW, error: null });
    mockFrom.mockReturnValue({ update: vi.fn(() => chain) });

    await updateAvatar("c1", VALID_ID, { name: "x" }, { ifFrontUrl: null });

    expect(isCalls).toContainEqual(["front", null]);
    expect(eqCalls.some(([column]) => column === "front->>url")).toBe(false);
  });
});
