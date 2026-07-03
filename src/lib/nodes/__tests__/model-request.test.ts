import { describe, it, expect } from "vitest";
import { describeModelRequest } from "@/lib/nodes/model-request";
import type { UpstreamPreview } from "@/lib/nodes/resolve-inputs";

// Minimal upstream fixtures — only the fields visionAttachmentUrls reads.
const imageFile = {
  nodeId: "n1", versionId: "v1", type: "file", label: "ref.png",
  text: "", fileKind: "image", fileUrl: "https://cdn/ref.png", useLlm: false,
} as unknown as UpstreamPreview;

const docFile = {
  nodeId: "n2", versionId: "v2", type: "file", label: "brief.pdf",
  text: "brief text", fileKind: "document", fileUrl: "https://cdn/brief.pdf", useLlm: true,
} as unknown as UpstreamPreview;

describe("describeModelRequest", () => {
  it("captures the system prompt, compiled user text, and effective instruction verbatim", () => {
    const rec = describeModelRequest({
      system: "SYS", compiledUser: "USER BLOCK", effectiveInstruction: "make it airy", upstream: [],
    });
    expect(rec.systemPrompt).toBe("SYS");
    expect(rec.compiledUser).toBe("USER BLOCK");
    expect(rec.effectiveInstruction).toBe("make it airy");
    expect(rec.attachments).toEqual([]);
  });

  it("records only the image URLs that were sent as vision parts", () => {
    const rec = describeModelRequest({
      system: "SYS", compiledUser: "U", effectiveInstruction: "i", upstream: [imageFile, docFile],
    });
    expect(rec.attachments).toEqual(["https://cdn/ref.png"]); // the doc is text, not a vision part
  });
});
