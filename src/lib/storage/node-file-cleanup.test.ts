import { describe, it, expect, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({
  // What the "does any OTHER node point at this URL?" query answers.
  otherRefs: { count: 0, error: null as { message: string } | null },
}));

vi.mock("./gcs", () => ({
  _put: vi.fn(),
  _signPutUrl: vi.fn(),
  _remove: vi.fn(async () => {}),
  getBucketName: () => "test-bucket",
  publicUrlFor: (p: string) => `https://storage.googleapis.com/test-bucket/${p}`,
  _resetGcsClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          neq: async () => state.otherRefs,
        }),
      }),
    }),
    storage: { from: () => ({ remove: vi.fn(async () => ({ error: null })) }) },
  }),
}));

import { removeNodeFileObject } from "./node-file-cleanup";
import { _remove } from "./gcs";

const NODE = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";
const url = (path: string) => `https://storage.googleapis.com/test-bucket/${path}`;
const ownFile = url(`clients/c1/canvases/ca1/nodes/${NODE}/files/photo__ts.jpg`);

beforeEach(() => {
  vi.mocked(_remove).mockClear();
  state.otherRefs = { count: 0, error: null };
});

describe("removeNodeFileObject", () => {
  it("deletes the object when this node is its only reference", async () => {
    const result = await removeNodeFileObject(NODE, ownFile);
    expect(result).toEqual({ removed: true });
    expect(_remove).toHaveBeenCalledWith(
      `clients/c1/canvases/ca1/nodes/${NODE}/files/photo__ts.jpg`,
    );
  });

  it("keeps the object when another node still points at the same URL", async () => {
    // The gallery/reference pickers create file nodes that reuse an existing object's URL
    // instead of copying the bytes, so one object can back many nodes.
    state.otherRefs = { count: 3, error: null };
    const result = await removeNodeFileObject(NODE, ownFile);
    expect(result).toEqual({ removed: false, reason: "shared" });
    expect(_remove).not.toHaveBeenCalled();
  });

  it("keeps an object that lives under a different node's files/", async () => {
    const result = await removeNodeFileObject(
      NODE,
      url(`clients/c1/canvases/ca1/nodes/${OTHER}/files/photo__ts.jpg`),
    );
    expect(result).toEqual({ removed: false, reason: "not-this-nodes-file" });
    expect(_remove).not.toHaveBeenCalled();
  });

  it("keeps a generation output — never deletes another node's image-gen/", async () => {
    const result = await removeNodeFileObject(
      NODE,
      url(`clients/c1/canvases/ca1/nodes/${OTHER}/image-gen/output__ts.png`),
    );
    expect(result).toEqual({ removed: false, reason: "not-this-nodes-file" });
    expect(_remove).not.toHaveBeenCalled();
  });

  it("keeps this node's own generation output too — files/ only", async () => {
    const result = await removeNodeFileObject(
      NODE,
      url(`clients/c1/canvases/ca1/nodes/${NODE}/image-gen/output__ts.png`),
    );
    expect(result).toEqual({ removed: false, reason: "not-this-nodes-file" });
    expect(_remove).not.toHaveBeenCalled();
  });

  it("ignores a URL that isn't an object in our bucket", async () => {
    const result = await removeNodeFileObject(NODE, "https://example.com/someone-elses.jpg");
    expect(result).toEqual({ removed: false, reason: "not-our-storage" });
    expect(_remove).not.toHaveBeenCalled();
  });

  it("fails closed when the reference check errors", async () => {
    state.otherRefs = { count: 0, error: { message: "db down" } };
    const result = await removeNodeFileObject(NODE, ownFile);
    expect(result).toEqual({ removed: false, reason: "unverified" });
    expect(_remove).not.toHaveBeenCalled();
  });
});
