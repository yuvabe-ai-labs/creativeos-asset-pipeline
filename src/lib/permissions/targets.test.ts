import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { calls, state } = vi.hoisted(() => ({
  calls: { table: "", select: "", eq: [] as [string, unknown][] },
  state: { next: { data: null, error: null } as { data: unknown; error: { message: string } | null } },
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: () => ({
    from(table: string) {
      calls.table = table;
      const q = {
        select(cols: string) {
          calls.select = cols;
          return q;
        },
        eq(col: string, val: unknown) {
          calls.eq.push([col, val]);
          return q;
        },
        maybeSingle: async () => state.next,
      };
      return q;
    },
  }),
}));

import { resolveTarget } from "./targets";

function row(data: unknown) {
  state.next = { data, error: null };
}

describe("resolveTarget", () => {
  beforeEach(() => {
    calls.table = "";
    calls.select = "";
    calls.eq = [];
    state.next = { data: null, error: null };
  });

  it("clientId resolves to the client and its org", async () => {
    row({ id: "c1", org_id: "o1" });
    expect(await resolveTarget({ clientId: "c1" })).toEqual({ clientId: "c1", orgId: "o1" });
    expect(calls).toEqual({ table: "clients", select: "id, org_id", eq: [["id", "c1"]] });
  });

  it("clientId with no row is null", async () => {
    expect(await resolveTarget({ clientId: "c1" })).toBeNull();
  });

  it.each([
    ["object", { org_id: "o1" }],
    ["one-element array", [{ org_id: "o1" }]],
  ])("canvasId unwraps clients as %s", async (_n, clients) => {
    row({ client_id: "c1", clients });
    expect(await resolveTarget({ canvasId: "cv1" })).toEqual({ clientId: "c1", orgId: "o1" });
    expect(calls).toEqual({ table: "canvases", select: "client_id, clients!inner(org_id)", eq: [["id", "cv1"]] });
  });

  it("canvasId with no row is null", async () => {
    expect(await resolveTarget({ canvasId: "cv1" })).toBeNull();
  });

  it.each([
    ["objects", { client_id: "c1", clients: { org_id: "o1" } }],
    ["arrays", [{ client_id: "c1", clients: [{ org_id: "o1" }] }]],
  ])("nodeId unwraps nested embeds as %s and includes nodeType", async (_n, canvases) => {
    row({ type: "script", canvases });
    expect(await resolveTarget({ nodeId: "n1" })).toEqual({ clientId: "c1", orgId: "o1", nodeType: "script" });
    expect(calls).toEqual({
      table: "nodes",
      select: "type, canvases!inner(client_id, clients!inner(org_id))",
      eq: [["id", "n1"]],
    });
  });

  it("nodeId with no row is null", async () => {
    expect(await resolveTarget({ nodeId: "n1" })).toBeNull();
  });

  it.each([
    ["objects", { type: "image", canvases: { client_id: "c1" } }],
    ["arrays", [{ type: "image", canvases: [{ client_id: "c1" }] }]],
  ])("versionId takes the org from node_versions and the client from nodes>canvases (%s)", async (_n, nodes) => {
    row({ org_id: "o1", node_id: "n1", nodes });
    expect(await resolveTarget({ versionId: "v1" })).toEqual({ clientId: "c1", orgId: "o1", nodeType: "image", nodeId: "n1" });
    expect(calls).toEqual({
      table: "node_versions",
      select: "org_id, node_id, nodes!inner(type, canvases!inner(client_id))",
      eq: [["id", "v1"]],
    });
  });

  it("kbVersionId resolves client and org through clients", async () => {
    row({ client_id: "c1", clients: [{ org_id: "o1" }] });
    expect(await resolveTarget({ kbVersionId: "kv1" })).toEqual({ clientId: "c1", orgId: "o1" });
    expect(calls).toEqual({
      table: "client_kb_versions",
      select: "client_id, clients!client_kb_versions_client_id_fkey!inner(org_id)",
      eq: [["id", "kv1"]],
    });
  });

  it("kbJobId resolves client and org from the job row", async () => {
    row({ client_id: "c1", org_id: "o1" });
    expect(await resolveTarget({ kbJobId: "j1" })).toEqual({ clientId: "c1", orgId: "o1" });
    expect(calls).toEqual({ table: "client_kb_jobs", select: "client_id, org_id", eq: [["id", "j1"]] });
  });

  it("a query error rejects instead of returning null", async () => {
    state.next = { data: null, error: { message: "boom" } };
    await expect(resolveTarget({ clientId: "c1" })).rejects.toMatchObject({ message: "boom" });
  });
});
