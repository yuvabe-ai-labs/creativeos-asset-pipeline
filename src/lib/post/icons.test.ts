import { describe, it, expect } from "vitest";
import { resolveSimpleIcon, resolveIconSource } from "./icons";

describe("resolveSimpleIcon", () => {
  it("resolves a known brand icon (instagram) to path/hex/title", () => {
    const icon = resolveSimpleIcon("instagram");
    expect(icon).not.toBeNull();
    expect(icon!.path.length).toBeGreaterThan(0);
    expect(icon!.title.toLowerCase()).toContain("instagram");
  });

  it("resolves whatsapp and facebook too — the contact-strip icons Lucide 1.0 removed under trademark pressure (§7.2)", () => {
    expect(resolveSimpleIcon("whatsapp")).not.toBeNull();
    expect(resolveSimpleIcon("facebook")).not.toBeNull();
  });

  it("returns null for an unknown name rather than throwing", () => {
    expect(resolveSimpleIcon("not-a-real-brand-xyz")).toBeNull();
  });
});

describe("resolveIconSource", () => {
  it("passes a lucide source through by name unchanged", () => {
    expect(resolveIconSource({ kind: "lucide", name: "phone" })).toEqual({
      kind: "lucide",
      value: "phone",
    });
  });

  it("passes a url source through unchanged", () => {
    expect(resolveIconSource({ kind: "url", url: "https://x/icon.svg" })).toEqual({
      kind: "url",
      value: "https://x/icon.svg",
    });
  });

  it("resolves a simple source to its icon data", () => {
    const result = resolveIconSource({ kind: "simple", name: "instagram" });
    expect(result.kind).toBe("simple");
    expect((result.value as { path: string }).path.length).toBeGreaterThan(0);
  });

  it("falls back to an empty-path placeholder for an unresolvable simple name, rather than throwing", () => {
    const result = resolveIconSource({ kind: "simple", name: "not-a-real-brand-xyz" });
    expect((result.value as { path: string }).path).toBe("");
  });
});
