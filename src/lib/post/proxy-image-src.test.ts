import { describe, it, expect } from "vitest";
import { proxyImageSrc } from "./proxy-image-src";

describe("proxyImageSrc", () => {
  it("rewrites a GCS-hosted url through /api/image-proxy", () => {
    const url = "https://storage.googleapis.com/bucket/path/image.png";
    expect(proxyImageSrc(url)).toBe(`/api/image-proxy?url=${encodeURIComponent(url)}`);
  });

  it("passes through a non-GCS url unchanged", () => {
    expect(proxyImageSrc("https://example.com/image.png")).toBe("https://example.com/image.png");
  });

  it("passes through a data: url unchanged", () => {
    expect(proxyImageSrc("data:image/png;base64,abc")).toBe("data:image/png;base64,abc");
  });
});
