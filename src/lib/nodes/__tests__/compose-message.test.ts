import { describe, it, expect } from "vitest";
import { buildUserContent } from "../compose-message";
import type { UpstreamPreview } from "../resolve-inputs";

const base = { nodeId: "n", versionId: null, label: "X", text: "" };

describe("buildUserContent vision handling", () => {
  it("treats an image-gen upstream WITH a fileUrl as a vision part", () => {
    const up: UpstreamPreview[] = [
      { ...base, type: "image-gen", fileUrl: "https://x/img.png", fileKind: "image" },
    ];
    const content = buildUserContent("PROMPT", up);
    expect(Array.isArray(content)).toBe(true);
    expect(content).toContainEqual({ type: "image_url", image_url: { url: "https://x/img.png", detail: "auto" } });
  });

  it("does NOT treat an image-gen upstream WITHOUT a fileUrl as vision (image-Prompt path)", () => {
    const up: UpstreamPreview[] = [{ ...base, type: "image-gen", text: "https://x/img.png" }];
    const content = buildUserContent("PROMPT", up);
    expect(content).toBe("PROMPT"); // plain string — no vision part
  });
});
