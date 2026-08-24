import { describe, it, expect } from "vitest";
import {
  summarizeCounts,
  selectInboxFor,
  inboxFilterFor,
  type InboxItem,
} from "./queue";

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
    approvedByUserId: null,
    approvedSeenAt: null,
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

describe("selectInboxFor — unseen approvals (D170/D171)", () => {
  const myApprovedUnseen = item({
    versionId: "au1",
    approvalStatus: "approved",
    operatorUserId: "me",
    approvedByUserId: "senior-1",
    approvedSeenAt: null,
  });
  const mySelfApproved = item({
    versionId: "au2",
    approvalStatus: "approved",
    operatorUserId: "me",
    approvedByUserId: "me",
    approvedSeenAt: null,
  });
  const myApprovedSeen = item({
    versionId: "au3",
    approvalStatus: "approved",
    operatorUserId: "me",
    approvedByUserId: "senior-1",
    approvedSeenAt: "2026-08-24T00:00:00Z",
  });
  const othersApprovedUnseen = item({
    versionId: "au4",
    approvalStatus: "approved",
    operatorUserId: "someone-else",
    approvedByUserId: "senior-1",
    approvedSeenAt: null,
  });
  const all = [myApprovedUnseen, mySelfApproved, myApprovedSeen, othersApprovedUnseen];

  it("designer sees their own unseen approval — D170", () => {
    expect(selectInboxFor("designer", "me", all).map((i) => i.versionId)).toEqual(["au1"]);
  });

  it("senior/owner sees their own unseen approval too — D170 applies to every role", () => {
    for (const role of ["senior", "owner"] as const) {
      expect(selectInboxFor(role, "me", all).map((i) => i.versionId)).toContain("au1");
    }
  });

  it("self-approval never notifies — D171", () => {
    expect(selectInboxFor("designer", "me", all).map((i) => i.versionId)).not.toContain("au2");
  });

  it("an already-seen approval does not reappear", () => {
    expect(selectInboxFor("designer", "me", all).map((i) => i.versionId)).not.toContain("au3");
  });

  it("someone else's approval never appears in my inbox", () => {
    expect(selectInboxFor("designer", "me", all).map((i) => i.versionId)).not.toContain("au4");
  });
});

// inboxFilterFor expresses the SAME rule as selectInboxFor, in PostgREST syntax, so the
// database can page it. Two expressions of one rule can drift; this evaluates the filter
// against the fixtures and asserts it selects exactly what the JS selector does.
describe("inboxFilterFor agrees with selectInboxFor", () => {
  // A deliberately small PostgREST `or`-filter evaluator — enough for the shapes this
  // function emits (`field.eq.X`, `field.neq.X`, `field.is.null`, and `and(...)`). If the
  // filter ever grows a shape this cannot parse, it throws rather than silently passing.
  function evaluate(filter: string, item: InboxItem): boolean {
    const clauses: string[] = [];
    let depth = 0;
    let current = "";
    for (const ch of filter) {
      if (ch === "(") depth++;
      if (ch === ")") depth--;
      if (ch === "," && depth === 0) {
        clauses.push(current);
        current = "";
        continue;
      }
      current += ch;
    }
    if (current) clauses.push(current);

    const field = (name: string): string | null => {
      switch (name) {
        case "approval_status":
          return item.approvalStatus;
        case "operator_user_id":
          return item.operatorUserId;
        case "approved_by_user_id":
          return item.approvedByUserId;
        case "approved_seen_at":
          return item.approvedSeenAt;
        default:
          throw new Error(`Unknown field: ${name}`);
      }
    };

    const evalOne = (clause: string): boolean => {
      const and = clause.match(/^and\((.*)\)$/);
      if (and) return and[1].split(",").every(evalOne);
      const isNull = clause.match(/^([a-z_]+)\.is\.null$/);
      if (isNull) return field(isNull[1]) === null;
      const neq = clause.match(/^([a-z_]+)\.neq\.(.*)$/);
      if (neq) return field(neq[1]) !== neq[2];
      const eq = clause.match(/^([a-z_]+)\.eq\.(.*)$/);
      if (eq) return field(eq[1]) === eq[2];
      throw new Error(`Unparsed filter clause: ${clause}`);
    };

    return clauses.some(evalOne);
  }

  const fixtures = [
    item({ versionId: "p1", approvalStatus: "pending", operatorUserId: "someone" }),
    item({ versionId: "p2", approvalStatus: "pending", operatorUserId: "me" }),
    item({ versionId: "r1", approvalStatus: "changes_requested", operatorUserId: "me" }),
    item({ versionId: "r2", approvalStatus: "changes_requested", operatorUserId: "someone" }),
    item({
      versionId: "au1",
      approvalStatus: "approved",
      operatorUserId: "me",
      approvedByUserId: "senior-1",
      approvedSeenAt: null,
    }),
    item({
      versionId: "au2",
      approvalStatus: "approved",
      operatorUserId: "me",
      approvedByUserId: "me",
      approvedSeenAt: null,
    }),
    item({
      versionId: "au3",
      approvalStatus: "approved",
      operatorUserId: "me",
      approvedByUserId: "senior-1",
      approvedSeenAt: "2026-08-24T00:00:00Z",
    }),
    item({
      versionId: "au4",
      approvalStatus: "approved",
      operatorUserId: "someone",
      approvedByUserId: "senior-1",
      approvedSeenAt: null,
    }),
  ];

  for (const role of ["designer", "senior", "owner"] as const) {
    it(`selects the same items for ${role}`, () => {
      const viaSql = fixtures
        .filter((i) => evaluate(inboxFilterFor(role, "me"), i))
        .map((i) => i.versionId);
      const viaJs = selectInboxFor(role, "me", fixtures).map((i) => i.versionId);
      expect(viaSql.sort()).toEqual(viaJs.sort());
    });
  }
});
