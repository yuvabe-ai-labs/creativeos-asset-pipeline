import { describe, it, expect } from "vitest";
import { maskFileFromInput } from "../providers/openai";

describe("maskFileFromInput", () => {
  it("returns undefined when there is no mask", () => {
    expect(maskFileFromInput({})).toBeUndefined();
  });
  it("builds a PNG File from base64 with the given mime", () => {
    const b64 = Buffer.from("hello").toString("base64");
    const file = maskFileFromInput({ maskBase64: b64, maskMime: "image/png" });
    expect(file).toBeInstanceOf(File);
    expect(file!.type).toBe("image/png");
    expect(file!.name).toBe("mask.png");
  });
});
