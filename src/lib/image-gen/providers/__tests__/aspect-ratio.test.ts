import { describe, it, expect } from "vitest";
import { aspectRatioToOpenAISize } from "../openai";

describe("aspectRatioToOpenAISize", () => {
  it("maps 1:1 to square", () => { expect(aspectRatioToOpenAISize("1:1")).toBe("1024x1024"); });
  it("maps 16:9 to landscape", () => { expect(aspectRatioToOpenAISize("16:9")).toBe("1536x1024"); });
  it("maps 9:16 to portrait", () => { expect(aspectRatioToOpenAISize("9:16")).toBe("1024x1536"); });
  it("maps 4:3 to nearest landscape", () => { expect(aspectRatioToOpenAISize("4:3")).toBe("1536x1024"); });
  it("maps 3:4 to nearest portrait", () => { expect(aspectRatioToOpenAISize("3:4")).toBe("1024x1536"); });
  it("maps 21:9 to widest landscape", () => { expect(aspectRatioToOpenAISize("21:9")).toBe("1536x1024"); });
  it("maps 4:1 to widest landscape", () => { expect(aspectRatioToOpenAISize("4:1")).toBe("1536x1024"); });
  it("maps 1:4 to tallest portrait", () => { expect(aspectRatioToOpenAISize("1:4")).toBe("1024x1536"); });
  it("falls back to square for unknown ratio", () => { expect(aspectRatioToOpenAISize("unknown")).toBe("1024x1024"); });
});
