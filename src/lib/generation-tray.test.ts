import { describe, it, expect } from "vitest";
import type { Edge } from "@xyflow/react";
import type { AppNode } from "@/lib/canvas-nodes";
import type { GenerationRow } from "@/lib/db/types";
import {
  findShotAncestor,
  resolveShotLabel,
  latestJobPerNode,
  deriveTrayItems,
  STALE_RUNNING_MS,
} from "./generation-tray";

// Minimal node/edge factories — only the fields the walk reads.
const node = (id: string, type: string, data: Record<string, unknown> = {}): AppNode =>
  ({ id, type, position: { x: 0, y: 0 }, data } as AppNode);
const edge = (source: string, target: string): Edge =>
  ({ id: `${source}-${target}`, source, target });

describe("findShotAncestor", () => {
  it("walks image-gen ← prompt ← shot", () => {
    const nodes = [node("s", "shot", { order: 3 }), node("p", "prompt"), node("g", "image-gen")];
    const edges = [edge("s", "p"), edge("p", "g")];
    expect(findShotAncestor("g", nodes, edges)?.id).toBe("s");
  });

  it("walks video-gen ← video-prompt ← shot", () => {
    const nodes = [node("s", "shot", { order: 1 }), node("vp", "video-prompt"), node("vg", "video-gen")];
    const edges = [edge("s", "vp"), edge("vp", "vg")];
    expect(findShotAncestor("vg", nodes, edges)?.id).toBe("s");
  });

  it("returns null when no shot ancestor exists", () => {
    const nodes = [node("f", "file"), node("g", "image-gen")];
    const edges = [edge("f", "g")];
    expect(findShotAncestor("g", nodes, edges)).toBeNull();
  });
});

describe("resolveShotLabel", () => {
  it("labels by the shot's 1-based order", () => {
    const nodes = [node("s", "shot", { order: 3 }), node("p", "prompt"), node("g", "image-gen")];
    const edges = [edge("s", "p"), edge("p", "g")];
    expect(resolveShotLabel("g", nodes, edges)).toBe("Shot 3");
  });

  it("falls back to the node's own title when there is no shot", () => {
    const nodes = [node("g", "image-gen", { title: "Hero still" })];
    expect(resolveShotLabel("g", [], [])).toBe("Untitled"); // node not in list → fallback
    expect(resolveShotLabel("g", nodes, [])).toBe("Hero still");
  });
});

const job = (over: Partial<GenerationRow>): GenerationRow =>
  ({
    id: "j", node_id: "g", type: "image", status: "running",
    provider_job_id: null, model_used: null, params_snapshot: null,
    inputs_snapshot: null, tokens_used: null, credits_consumed: null,
    version_id: null, user_id: null, error: null, meta: null,
    created_at: "2026-07-05T00:00:00.000Z", updated_at: "2026-07-05T00:00:00.000Z",
    ...over,
  });

describe("latestJobPerNode", () => {
  it("keeps only the newest row per node_id", () => {
    const rows = [
      job({ id: "a", node_id: "g", created_at: "2026-07-05T00:00:00.000Z" }),
      job({ id: "b", node_id: "g", created_at: "2026-07-05T00:01:00.000Z" }),
    ];
    const latest = latestJobPerNode(rows);
    expect(latest).toHaveLength(1);
    expect(latest[0].id).toBe("b");
  });
});

describe("deriveTrayItems", () => {
  const now = Date.parse("2026-07-05T00:00:30.000Z"); // 30s after the base timestamp

  it("maps succeeded→ready, running→running, failed→failed", () => {
    const nodes = [node("g1", "image-gen"), node("g2", "image-gen"), node("g3", "video-gen")];
    const jobs = [
      job({ id: "a", node_id: "g1", type: "image", status: "succeeded" }),
      job({ id: "b", node_id: "g2", type: "image", status: "running" }),
      job({ id: "c", node_id: "g3", type: "video", status: "failed" }),
    ];
    const items = deriveTrayItems(nodes, [], jobs, now);
    const byNode = Object.fromEntries(items.map((i) => [i.nodeId, i.status]));
    expect(byNode).toEqual({ g1: "ready", g2: "running", g3: "failed" });
  });

  it("excludes prompt jobs and jobs whose node was deleted", () => {
    const jobs = [
      job({ id: "p", node_id: "pr", type: "prompt", status: "succeeded" }),
      job({ id: "gone", node_id: "missing", type: "image", status: "succeeded" }),
    ];
    expect(deriveTrayItems([node("pr", "prompt")], [], jobs, now)).toEqual([]);
  });

  it("renders a stale running IMAGE job as failed, but not a running video", () => {
    const stale = Date.parse("2026-07-05T00:00:00.000Z") + STALE_RUNNING_MS + 1;
    const jobs = [
      job({ id: "i", node_id: "gi", type: "image", status: "running" }),
      job({ id: "v", node_id: "gv", type: "video", status: "running" }),
    ];
    const items = deriveTrayItems([node("gi", "image-gen"), node("gv", "video-gen")], [], jobs, stale);
    expect(items.find((i) => i.nodeId === "gi")?.status).toBe("failed");
    expect(items.find((i) => i.nodeId === "gv")?.status).toBe("running");
  });

  it("drops a Ready item once its node's active version is approved", () => {
    const nodes = [node("g", "image-gen", { approvalStatus: "approved" })];
    const jobs = [job({ id: "a", node_id: "g", type: "image", status: "succeeded" })];
    expect(deriveTrayItems(nodes, [], jobs, now)).toEqual([]);
  });

  it("sorts Running → Failed → Ready, then by shot order", () => {
    const nodes = [
      node("s1", "shot", { order: 1 }), node("p1", "prompt"), node("g1", "image-gen"),
      node("s2", "shot", { order: 2 }), node("p2", "prompt"), node("g2", "image-gen"),
    ];
    const edges = [edge("s1", "p1"), edge("p1", "g1"), edge("s2", "p2"), edge("p2", "g2")];
    const jobs = [
      job({ id: "ready2", node_id: "g2", status: "succeeded" }),   // shot 2, ready
      job({ id: "run1", node_id: "g1", status: "running" }),       // shot 1, running
    ];
    const order = deriveTrayItems(nodes, edges, jobs, now).map((i) => i.status);
    expect(order).toEqual(["running", "ready"]);
  });
});
