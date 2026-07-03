import { describe, it, expect } from "vitest";
import { mapNodeTraces, GENERATED_TYPES } from "@/lib/eval/node-traces";

const promptNode = { id: "n1", type: "prompt", data: { evalKey: "s22-shot2" }, active_version_id: "v2" };
const imageNode  = { id: "n2", type: "image-gen", data: { title: "s22 image" }, active_version_id: "iv1" };
const textNode   = { id: "n3", type: "text", data: {}, active_version_id: "tv1" }; // excluded

const v1 = { id: "v1", node_id: "n1", created_at: "2026-07-01T10:00:00Z",
  inputs_used: { shotText: "wide shot", request: { systemPrompt: "SYS", compiledUser: "U1", attachments: [], effectiveInstruction: "go" } },
  params_used: { instruction: "", controls: { lens: "auto" }, promptVersion: "2" },
  generated_output: "85mm portrait", output: "85mm portrait", decision: "fail", note: "lens" };
const v2 = { id: "v2", node_id: "n1", created_at: "2026-07-01T11:00:00Z",
  inputs_used: { shotText: "wide shot", request: { systemPrompt: "SYS", compiledUser: "U2", attachments: [], effectiveInstruction: "wide" } },
  params_used: { instruction: "wide", controls: { lens: "wide-24" }, promptVersion: "2" },
  generated_output: "24mm wide", output: "24mm wide", decision: null, note: null };
const iv1 = { id: "iv1", node_id: "n2", created_at: "2026-07-01T12:00:00Z",
  inputs_used: { request: { systemPrompt: "S", compiledUser: "prompt text", attachments: ["https://cdn/ref.png"], effectiveInstruction: "" } },
  params_used: {}, generated_output: "https://cdn/out.png", output: "https://cdn/out.png", decision: "pass", note: null };

describe("mapNodeTraces", () => {
  it("groups versions under their node, newest first, and excludes content nodes", () => {
    const traces = mapNodeTraces([promptNode, imageNode, textNode], [v1, v2, iv1]);
    expect(traces.map((t) => t.nodeId)).toEqual(["n1", "n2"]); // text node dropped
    const prompt = traces[0];
    expect(prompt.action).toBe("prompt");
    expect(prompt.title).toBe("s22-shot2");
    expect(prompt.activeVersionId).toBe("v2");
    expect(prompt.versions.map((v) => v.versionId)).toEqual(["v2", "v1"]); // newest → oldest
  });

  it("builds a text output for prompt nodes and an image output (urls) for image-gen", () => {
    const traces = mapNodeTraces([promptNode, imageNode], [v2, iv1]);
    expect(traces[0].versions[0].output).toEqual({ kind: "text", text: "24mm wide" });
    expect(traces[1].versions[0].output).toEqual({ kind: "image", urls: ["https://cdn/out.png"] });
  });

  it("carries the input (shot text + attachment images), the request, and the Δ fields", () => {
    const [prompt, image] = mapNodeTraces([promptNode, imageNode], [v2, iv1]);
    expect(prompt.versions[0].input).toEqual({ text: "wide shot", images: [] });
    expect(image.versions[0].input.images).toEqual(["https://cdn/ref.png"]);
    expect(prompt.versions[0].request?.compiledUser).toBe("U2");
    expect(prompt.versions[0].controls).toEqual({ lens: "wide-24" });
    expect(prompt.versions[0].instruction).toBe("wide");
    expect(prompt.versions[0].decision).toBe(null);
  });

  it("exposes the generated-type allowlist", () => {
    expect(GENERATED_TYPES).toContain("prompt");
    expect(GENERATED_TYPES).not.toContain("text");
  });
});
