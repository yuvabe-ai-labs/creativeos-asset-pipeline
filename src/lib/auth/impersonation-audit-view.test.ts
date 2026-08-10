import { describe, it, expect } from "vitest";
import { classifyWriteAction } from "./impersonation-audit-view";

describe("classifyWriteAction", () => {
  it("treats autosaves as quiet — the flood this whole view exists to suppress", () => {
    expect(classifyWriteAction({ action: "saveCanvasAction" })).toEqual({ kind: "quiet" });
    expect(classifyWriteAction({ action: "saveCanvasNodesAction" })).toEqual({ kind: "quiet" });
  });

  it("treats upload signing handshakes and compute-only POSTs as quiet", () => {
    for (const path of [
      "/api/nodes/abc/file/sign",
      "/api/clients/abc/logo/sign",
      "/api/nodes/abc/cost",
      "/api/nodes/abc/compile-preview",
      "/api/nodes/abc/upstream-images",
    ]) {
      expect(classifyWriteAction({ method: "POST", path })).toEqual({ kind: "quiet" });
    }
  });

  it("gives known server actions a human label", () => {
    expect(classifyWriteAction({ action: "deleteCanvasAction" })).toEqual({
      kind: "action",
      label: "Deleted a canvas",
    });
    expect(classifyWriteAction({ action: "setVersionLabelAction" })).toEqual({
      kind: "action",
      label: "Labelled a version",
    });
  });

  it("extracts the node id from a generate path so it can be matched exactly", () => {
    const nodeId = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
    expect(classifyWriteAction({ method: "POST", path: `/api/nodes/${nodeId}/generate` })).toEqual({
      kind: "generate",
      nodeId,
    });
    expect(
      classifyWriteAction({ method: "POST", path: `/api/nodes/${nodeId}/video-generate` }),
    ).toEqual({ kind: "generate", nodeId });
  });

  it("labels deletes by the resource they target", () => {
    expect(
      classifyWriteAction({ method: "DELETE", path: "/api/moodboards/m1/items/i1" }),
    ).toEqual({ kind: "action", label: "Deleted a moodboard item" });
    expect(
      classifyWriteAction({ method: "DELETE", path: "/api/clients/c1/kb/documents" }),
    ).toEqual({ kind: "action", label: "Deleted a knowledge-base document" });
  });

  it("labels known route families", () => {
    expect(
      classifyWriteAction({ method: "POST", path: "/api/nodes/n1/file/finalize" }),
    ).toEqual({ kind: "action", label: "Uploaded a file" });
    expect(
      classifyWriteAction({ method: "POST", path: "/api/clients/c1/kb/re-extract" }),
    ).toEqual({ kind: "action", label: "Re-ran knowledge-base extraction" });
  });

  // The audit guarantee: a route nobody mapped must still SHOW UP.
  it("falls back to a visible METHOD /path for anything unmapped", () => {
    expect(
      classifyWriteAction({ method: "PATCH", path: "/api/clients/c1/something-new" }),
    ).toEqual({ kind: "action", label: "PATCH /api/clients/c1/something-new" });
  });

  it("never throws on a malformed or missing detail", () => {
    expect(classifyWriteAction(null)).toEqual({ kind: "action", label: "Unknown action" });
    expect(classifyWriteAction({})).toEqual({ kind: "action", label: "Unknown action" });
  });
});
