import { describe, it, expect } from "vitest";
import { connectionStateFor } from "../use-node-connection-state";

describe("connectionStateFor", () => {
  it("never dims the drag origin", () => {
    expect(connectionStateFor("a", "video-gen", "a", "video-gen", 0)).toBe("source");
  });
  it("offers a Dubbing node with no input, not one that already has its video", () => {
    expect(connectionStateFor("d", "dubbing", "v", "video-gen", 0)).toBe("valid");
    expect(connectionStateFor("d", "dubbing", "v", "video-gen", 1)).toBe("invalid");
  });
  it("still dims a type that cannot connect at all", () => {
    expect(connectionStateFor("d", "dubbing", "p", "prompt", 0)).toBe("invalid");
  });
});
