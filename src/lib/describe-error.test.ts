import { describe, it, expect } from "vitest";
import { describeError } from "./describe-error";

describe("describeError", () => {
  it("reads an Error's message", () => {
    expect(describeError(new Error("boom"))).toBe("boom");
  });

  it("reads a Supabase-style error object instead of printing [object Object]", () => {
    const e = { code: "PGRST205", message: "Could not find the table 'public.client_brand_image_cards'", details: null };
    expect(describeError(e)).toBe("PGRST205 | Could not find the table 'public.client_brand_image_cards'");
  });

  it("falls back to JSON for other objects, and String for the rest", () => {
    expect(describeError({ status: 503 })).toBe('{"status":503}');
    expect(describeError("plain")).toBe("plain");
  });
});
