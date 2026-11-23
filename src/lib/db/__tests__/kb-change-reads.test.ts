import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/** A query builder that records every call and answers with `result`. */
const q = vi.hoisted(() => ({ calls: [] as [string, unknown[]][], result: { data: null as unknown, error: null as unknown } }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: () => {
    const b: Record<string, unknown> = {};
    for (const name of ["from", "select", "update", "eq", "in", "order", "limit"]) {
      b[name] = (...args: unknown[]) => { q.calls.push([name, args]); return b; };
    }
    b.maybeSingle = async () => { q.calls.push(["maybeSingle", []]); return q.result; };
    b.then = (resolve: (v: unknown) => unknown) => resolve(q.result);
    return b;
  },
}));

import { readKBFieldValues } from "../kb";
import { claimChangeCard, listSettledChangeCards, setMessageCard } from "../copilot-messages";
import type { ChangeCard } from "@/lib/journey/thread/schema";

const card: ChangeCard = {
  kind: "change", versionId: "v1", status: "applied",
  fields: [{ path: "brand_profile.tone_of_voice", label: "Tone", before: "a", after: "b", from: "x.pdf", docId: "d1" }],
  decision: { by: "Cyril", byId: null, at: "2026-11-18T00:00:00Z", kept: [], outOfDate: [] },
};
const call = (name: string) => q.calls.filter(([n]) => n === name).map(([, a]) => a);

beforeEach(() => {
  q.calls = [];
  q.result = { data: null, error: null };
});

describe("readKBFieldValues", () => {
  it("reads only the values at these paths of one version, by JSON path", async () => {
    q.result = { data: { f0: "Warm", f1: ["cheap"] }, error: null };
    const values = await readKBFieldValues("v1", ["brand_profile.tone_of_voice", "compliance.never_use_words"]);
    expect(values).toEqual({ "brand_profile.tone_of_voice": "Warm", "compliance.never_use_words": ["cheap"] });
    expect(call("from")).toEqual([["client_kb_versions"]]);
    expect(call("select")[0][0]).toBe("f0:output->brand_profile->tone_of_voice->value,f1:output->compliance->never_use_words->value");
    expect(call("eq")).toEqual([["id", "v1"]]);
  });

  it("asks nothing for no paths", async () => {
    expect(await readKBFieldValues("v1", [])).toEqual({});
    expect(q.calls).toEqual([]);
  });

  it("refuses a path that is not a KB field, before it reaches a query", async () => {
    await expect(readKBFieldValues("v1", ["brand_profile.tone_of_voice);drop"])).rejects.toThrow();
    expect(q.calls).toEqual([]);
  });

  it("throws when the read fails or the version is gone", async () => {
    q.result = { data: null, error: { message: "down" } };
    await expect(readKBFieldValues("v1", ["brand_profile.tone_of_voice"])).rejects.toBeTruthy();
    q.result = { data: null, error: null };
    await expect(readKBFieldValues("v1", ["brand_profile.tone_of_voice"])).rejects.toThrow();
  });
});

describe("change cards in the thread", () => {
  it("claims a card only while it is still pending", async () => {
    q.result = { data: { id: "m1" }, error: null };
    expect(await claimChangeCard("c1", "m1", card)).toBe(true);
    expect(call("update")).toEqual([[{ card }]]);
    expect(call("eq")).toEqual(expect.arrayContaining([["id", "m1"], ["client_id", "c1"], ["thread", "onboarding"], ["card->>status", "pending"]]));
    q.result = { data: null, error: null };
    expect(await claimChangeCard("c1", "m1", card)).toBe(false);
  });

  it("puts a card back on its own message", async () => {
    await setMessageCard("c1", "m1", card);
    expect(call("update")).toEqual([[{ card }]]);
    expect(call("eq")).toEqual(expect.arrayContaining([["id", "m1"], ["client_id", "c1"], ["thread", "onboarding"]]));
  });

  it("lists every settled change card, with no read limit, and skips anything that is not one", async () => {
    q.result = { data: [{ card }, { card: { kind: "note" } }, { card: { kind: "change", broken: true } }], error: null };
    expect(await listSettledChangeCards("c1")).toEqual([card]);
    expect(call("eq")).toEqual(expect.arrayContaining([["client_id", "c1"], ["thread", "onboarding"], ["card->>kind", "change"]]));
    expect(call("in")).toEqual([["card->>status", ["applied", "discarded"]]]);
    expect(call("limit")).toEqual([]);
  });

  it("throws when the list cannot be read: a failed read is never 'nothing refused'", async () => {
    q.result = { data: null, error: { message: "down" } };
    await expect(listSettledChangeCards("c1")).rejects.toBeTruthy();
  });
});
