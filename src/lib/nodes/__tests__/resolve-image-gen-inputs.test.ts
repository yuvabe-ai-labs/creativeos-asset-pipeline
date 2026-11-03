import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/nodes", () => ({ getNodeActiveKB: vi.fn(), getNodeData: vi.fn(), getUpstreamOutputs: vi.fn() }));
vi.mock("@/lib/avatars/presenter-server", () => ({ getImageGenUpstream: vi.fn(), getPromptUpstream: vi.fn() }));

import { getImageGenUpstream } from "@/lib/avatars/presenter-server";
import { resolveImageGenInputs } from "../resolve-inputs";

const row = (nodeId: string, type: string, data: Record<string, unknown>, activeOutput: unknown = null) => ({
  nodeId, type, data, activeOutput, versionId: null,
});

beforeEach(() => vi.resetAllMocks());

describe("resolveImageGenInputs (D436)", () => {
  it("labels an avatar's front and sheet by type, each with its image URL", async () => {
    vi.mocked(getImageGenUpstream).mockResolvedValue([
      row("av-1", "file", { presenter: true, title: "Riya", fileKind: "image", fileUrl: "https://x/front.png" }),
      row("av-1:sheet", "file", { presenter: "sheet", title: "Riya", fileKind: "image", fileUrl: "https://x/sheet.png" }),
    ] as never);
    const out = await resolveImageGenInputs("ig-1");
    expect(out).toEqual([
      expect.objectContaining({ nodeId: "av-1", label: "Avatar", fileUrl: "https://x/front.png", fileKind: "image" }),
      expect.objectContaining({ nodeId: "av-1:sheet", label: "Avatar sheet", fileUrl: "https://x/sheet.png", fileKind: "image" }),
    ]);
  });

  it("sends a generated image as its URL, never as text, and leaves other inputs as they were", async () => {
    vi.mocked(getImageGenUpstream).mockResolvedValue([
      row("ig-0", "image-gen", {}, "https://x/still.png"),
      row("d1", "draw", { fileUrl: "https://x/sketch.png", text: "a sketch" }),
      row("p1", "prompt", {}, "A mug on a desk"),
    ] as never);
    const [still, sketch, prompt] = await resolveImageGenInputs("ig-1");
    expect(still).toMatchObject({ type: "image-gen", text: "", fileUrl: "https://x/still.png", fileKind: "image" });
    expect(sketch).toMatchObject({ type: "draw", fileUrl: "https://x/sketch.png" });
    expect(prompt).toMatchObject({ type: "prompt", text: "A mug on a desk", fileUrl: undefined });
  });
});
