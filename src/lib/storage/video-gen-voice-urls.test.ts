import { describe, it, expect, vi } from "vitest";

vi.mock("./gcs", () => ({
  _put: vi.fn(),
  _remove: vi.fn(),
  _signPutUrl: vi.fn(async (path: string) => `https://signed.example/${path}`),
  getBucketName: () => "test-bucket",
  publicUrlFor: (path: string) => `https://storage.googleapis.com/test-bucket/${path}`,
}));
vi.mock("./ownership", () => ({
  resolveOwnership: vi.fn(async () => ({ clientId: "c1", canvasId: "ca1" })),
}));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: vi.fn() }));

import { isOwnStoredUrl } from "./index";
import { pathForVideoGenVoice } from "./paths";

describe("pathForVideoGenVoice", () => {
  it("puts both variants beside the node's video-gen outputs, keyed by generation", () => {
    expect(
      pathForVideoGenVoice({ clientId: "c1", canvasId: "ca1", nodeId: "n1", generationId: "g1", variant: "original" }),
    ).toBe("clients/c1/canvases/ca1/nodes/n1/video-gen/g1-original.mp4");
  });
});

describe("isOwnStoredUrl", () => {
  it("accepts only this bucket's public URLs", () => {
    expect(isOwnStoredUrl("https://storage.googleapis.com/test-bucket/a.mp4")).toBe(true);
    expect(isOwnStoredUrl("https://storage.googleapis.com/other/a.mp4")).toBe(false);
    expect(isOwnStoredUrl("https://evil.example/a.mp4")).toBe(false);
  });
});
