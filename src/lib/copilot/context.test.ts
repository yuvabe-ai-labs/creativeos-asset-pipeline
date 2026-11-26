import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db/nodes", () => ({ listNodes: vi.fn() }));
vi.mock("@/lib/db/edges", () => ({ listEdges: vi.fn() }));
vi.mock("@/lib/nodes/describe-node", () => ({ describeNode: () => "a note", nodeHandle: () => "TXT-0001" }));

import { listNodes } from "@/lib/db/nodes";
import { listEdges } from "@/lib/db/edges";
import { buildCopilotContext } from "./context";

describe("buildCopilotContext", () => {
  it("reads the canvas's nodes and edges side by side", async () => {
    type Nodes = Awaited<ReturnType<typeof listNodes>>;
    let releaseNodes: (v: Nodes) => void = () => {};
    vi.mocked(listNodes).mockReturnValue(new Promise<Nodes>((r) => (releaseNodes = r)));
    vi.mocked(listEdges).mockResolvedValue([]);
    const pending = buildCopilotContext("canvas-1");
    await Promise.resolve();
    // The edges are asked for while the nodes are still loading.
    expect(listEdges).toHaveBeenCalledWith("canvas-1");
    releaseNodes([{ id: "n1", type: "text" }] as unknown as Nodes);
    expect(await pending).toContain("The canvas has 1 node(s)");
  });
});
