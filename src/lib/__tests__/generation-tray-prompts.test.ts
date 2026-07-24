import { describe, it, expect } from "vitest";
import { deriveTrayItems } from "../generation-tray";
import type { GenerationRow } from "@/lib/db/types";
import type { AppNode } from "@/lib/canvas-nodes";
import type { Edge } from "@xyflow/react";

const now = Date.now();

function makeJob(overrides: Partial<GenerationRow>): GenerationRow {
  return {
    id: crypto.randomUUID(),
    node_id: "node-1",
    type: "prompt",
    status: "succeeded",
    provider_job_id: null,
    model_used: "openai:gpt-5.4-mini",
    params_snapshot: null,
    inputs_snapshot: null,
    tokens_used: null,
    cost_usd: 0.001,
    credits_charged: null,
    version_id: "ver-1",
    user_id: null,
    error: null,
    meta: null,
    created_at: new Date(now - 5000).toISOString(),
    updated_at: new Date(now - 5000).toISOString(),
    ...overrides,
  };
}

function makeNode(id: string, type: string): AppNode {
  return { id, type, position: { x: 0, y: 0 }, data: {} } as AppNode;
}

describe("deriveTrayItems with prompts", () => {
  it("includes prompt-type jobs in tray items", () => {
    const jobs = [makeJob({ type: "prompt", status: "succeeded" })];
    const nodes = [makeNode("node-1", "prompt")];
    const edges: Edge[] = [];

    const items = deriveTrayItems(nodes, edges, jobs, now);
    expect(items).toHaveLength(1);
    expect(items[0].assetType).toBe("prompt");
  });

  it("still includes image-type jobs", () => {
    const jobs = [makeJob({ type: "image", status: "running" })];
    const nodes = [makeNode("node-1", "image-gen")];
    const edges: Edge[] = [];

    const items = deriveTrayItems(nodes, edges, jobs, now);
    expect(items).toHaveLength(1);
    expect(items[0].assetType).toBe("image");
  });
});
