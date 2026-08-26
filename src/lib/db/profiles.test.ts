import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFrom = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: () => ({ from: mockFrom }),
}));

import { resolveDisplayNames } from "./profiles";

// Stubs the two-query shape: org_memberships gates which ids are visible, profiles
// supplies the names. `members` is what the org actually contains.
function stubDb(members: string[], names: Record<string, string>) {
  const seen: { memberIds?: string[]; profileIds?: string[] } = {};
  mockFrom.mockImplementation((table: string) => {
    if (table === "org_memberships") {
      return {
        select: () => ({
          eq: () => ({
            in: async (_col: string, ids: string[]) => {
              seen.memberIds = ids;
              return {
                data: ids.filter((id) => members.includes(id)).map((id) => ({ user_id: id })),
                error: null,
              };
            },
          }),
        }),
      };
    }
    return {
      select: () => ({
        in: async (_col: string, ids: string[]) => {
          seen.profileIds = ids;
          return {
            data: ids.map((id) => ({ user_id: id, display_name: names[id] ?? "?" })),
            error: null,
          };
        },
      }),
    };
  });
  return seen;
}

beforeEach(() => mockFrom.mockReset());

describe("resolveDisplayNames", () => {
  it("returns an empty map for no ids, without querying at all", async () => {
    const out = await resolveDisplayNames("org-1", []);
    expect(out.size).toBe(0);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("resolves a member of the org", async () => {
    stubDb(["insider"], { insider: "Ruby" });
    const out = await resolveDisplayNames("org-1", ["insider"]);
    expect(out.get("insider")).toBe("Ruby");
  });

  it("omits an id belonging to another org — R11.5", async () => {
    // "outsider" is a real user, just not a member of org-1. It must not resolve, and
    // must not even reach the profiles query.
    const seen = stubDb(["insider"], { insider: "Ruby", outsider: "Someone Else" });
    const out = await resolveDisplayNames("org-1", ["insider", "outsider"]);
    expect(out.get("insider")).toBe("Ruby");
    expect(out.has("outsider")).toBe(false);
    expect(seen.profileIds).toEqual(["insider"]);
  });

  it("returns empty when none of the ids are members, without a profiles query", async () => {
    const seen = stubDb([], { outsider: "Someone Else" });
    const out = await resolveDisplayNames("org-1", ["outsider"]);
    expect(out.size).toBe(0);
    expect(seen.profileIds).toBeUndefined();
  });

  it("de-duplicates ids before querying", async () => {
    const seen = stubDb(["a"], { a: "Ruby" });
    await resolveDisplayNames("org-1", ["a", "a", "a"]);
    expect(seen.memberIds).toEqual(["a"]);
  });

  it("drops empty/null ids rather than querying for them", async () => {
    const seen = stubDb(["a"], { a: "Ruby" });
    await resolveDisplayNames("org-1", ["a", "", null as unknown as string]);
    expect(seen.memberIds).toEqual(["a"]);
  });
});
