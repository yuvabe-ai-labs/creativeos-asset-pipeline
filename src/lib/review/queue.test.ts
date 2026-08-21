import { describe, it, expect } from "vitest";
import { summarizeCounts, selectInboxFor, type InboxItem } from "./queue";

describe("summarizeCounts", () => {
  it("groups by canvas and sums to a client", () => {
    const out = summarizeCounts([
      { clientId: "c1", canvasId: "v1", pending: 5 },
      { clientId: "c1", canvasId: "v2", pending: 2 },
      { clientId: "c2", canvasId: "v3", pending: 1 },
    ]);
    expect(out.byCanvas).toEqual({ v1: 5, v2: 2, v3: 1 });
    expect(out.byClient).toEqual({ c1: 7, c2: 1 });
    expect(out.total).toBe(8);
  });

  it("is empty for no rows", () => {
    expect(summarizeCounts([])).toEqual({ byClient: {}, byCanvas: {}, total: 0 });
  });

  // R5.5 as an executable invariant, not an assumption. If this can ever fail, the client
  // and canvas pages disagree and users stop trusting every badge in the product.
  it("INVARIANT R5.5: a client's count equals the sum of its canvases'", () => {
    const rows = [
      { clientId: "c1", canvasId: "v1", pending: 3 },
      { clientId: "c1", canvasId: "v2", pending: 9 },
      { clientId: "c1", canvasId: "v3", pending: 0 },
      { clientId: "c2", canvasId: "v4", pending: 4 },
    ];
    const out = summarizeCounts(rows);
    for (const clientId of new Set(rows.map((r) => r.clientId))) {
      const sum = rows
        .filter((r) => r.clientId === clientId)
        .reduce((a, r) => a + r.pending, 0);
      expect(out.byClient[clientId]).toBe(sum);
    }
  });

  it("total equals the sum of every canvas", () => {
    const rows = [
      { clientId: "c1", canvasId: "v1", pending: 3 },
      { clientId: "c2", canvasId: "v2", pending: 4 },
    ];
    const out = summarizeCounts(rows);
    expect(out.total).toBe(Object.values(out.byCanvas).reduce((a, n) => a + n, 0));
  });
});

function item(over: Partial<InboxItem>): InboxItem {
  return {
    versionId: "v",
    nodeId: "n",
    nodeType: "image-gen",
    nodeTitle: "Shot 03",
    clientName: "Aurora",
    clientSlug: "aurora",
    canvasName: "Spring Reel",
    canvasSlug: "spring",
    output: null,
    approvalStatus: "pending",
    note: null,
    operatorUserId: "ruby",
    makerName: "Ruby",
    createdAt: "2026-08-21T00:00:00Z",
    ...over,
  };
}

describe("selectInboxFor", () => {
  const pendingOther = item({
    versionId: "p1",
    approvalStatus: "pending",
    operatorUserId: "someone",
  });
  const rejectedMine = item({
    versionId: "r1",
    approvalStatus: "changes_requested",
    operatorUserId: "me",
  });
  const rejectedOther = item({
    versionId: "r2",
    approvalStatus: "changes_requested",
    operatorUserId: "someone",
  });
  const approved = item({ versionId: "a1", approvalStatus: "approved" });
  const all = [pendingOther, rejectedMine, rejectedOther, approved];

  it("designer sees only their OWN rejected work — R9.5", () => {
    expect(selectInboxFor("designer", "me", all).map((i) => i.versionId)).toEqual(["r1"]);
  });

  it("senior sees everything pending, plus their own rejected work", () => {
    expect(selectInboxFor("senior", "me", all).map((i) => i.versionId).sort()).toEqual([
      "p1",
      "r1",
    ]);
  });

  it("owner is treated exactly as senior", () => {
    expect(selectInboxFor("owner", "me", all)).toEqual(selectInboxFor("senior", "me", all));
  });

  it("never includes approved work for anyone", () => {
    for (const role of ["designer", "senior", "owner"] as const) {
      expect(
        selectInboxFor(role, "me", all).some((i) => i.approvalStatus === "approved"),
      ).toBe(false);
    }
  });

  it("a senior does not see OTHER people's rejected work — that is the maker's to fix", () => {
    expect(selectInboxFor("senior", "me", all).map((i) => i.versionId)).not.toContain("r2");
  });

  it("a designer sees nothing when none of the rejected work is theirs", () => {
    expect(selectInboxFor("designer", "nobody", all)).toEqual([]);
  });
});
