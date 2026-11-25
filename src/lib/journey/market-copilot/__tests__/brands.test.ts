import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/openai/server", () => ({ createOpenAI: () => { throw new Error("tests pass a client"); } }));

import { findBrands, normalizeHandle, toBrands } from "../brands";
import { MARKET_BRANDS_PER_GROUP } from "../constants";

// D530 step 1: the agent proposes brands as Instagram handles with a reason, in Direct or Adjacent.

describe("normalizeHandle", () => {
  it("takes a profile url and lowercases it", () => {
    expect(normalizeHandle("https://www.instagram.com/Aqua.Voice_/?hl=en")).toBe("aqua.voice_");
  });
  it("takes @handle, a bare handle and instagram.com/x/", () => {
    expect(normalizeHandle("@Minimalist")).toBe("minimalist");
    expect(normalizeHandle("  sleepyowl ")).toBe("sleepyowl");
    expect(normalizeHandle("instagram.com/the.ordinary/")).toBe("the.ordinary");
  });
  it("is null for anything that is not a handle", () => {
    expect(normalizeHandle("not a handle!")).toBeNull();
    expect(normalizeHandle("")).toBeNull();
    expect(normalizeHandle("https://www.instagram.com/p/C8xyz/")).toBeNull();
    expect(normalizeHandle("a".repeat(31))).toBeNull();
  });
});

describe("toBrands", () => {
  const row = (handle: string, group = "direct") => ({ handle, name: handle.toUpperCase(), why: "because", group });

  it(`caps each group at ${MARKET_BRANDS_PER_GROUP}`, () => {
    const raw = [...Array.from({ length: 7 }, (_, i) => row(`d${i}`)), ...Array.from({ length: 7 }, (_, i) => row(`a${i}`, "adjacent"))];
    const out = toBrands(raw, new Set());
    expect(out.filter((b) => b.group === "direct")).toHaveLength(MARKET_BRANDS_PER_GROUP);
    expect(out.filter((b) => b.group === "adjacent")).toHaveLength(MARKET_BRANDS_PER_GROUP);
  });

  it("drops the client's own handle, duplicates, invalid handles and unknown groups", () => {
    const out = toBrands([row("@Own"), row("x"), row("X"), row("bad handle"), row("y", "custom")], new Set(["own"]));
    expect(out).toEqual([{ handle: "x", name: "X", why: "because", group: "direct", keep: true }]);
  });
});

describe("findBrands", () => {
  it("searches the web once and returns normalised brands", async () => {
    const create = vi.fn().mockResolvedValue({
      output_text: "```json\n" + JSON.stringify({ brands: [
        { handle: "https://instagram.com/Minimalist/", name: "Minimalist", why: "Same buyer.", group: "direct" },
        { handle: "@sleepyowl", name: "Sleepy Owl", why: "Audience overlap.", group: "adjacent" },
        { handle: "@tamarindtide", name: "Tamarind & Tide", why: "That's the client.", group: "direct" },
      ] }) + "\n```",
    });
    const out = await findBrands(
      { clientName: "Tamarind & Tide", kbText: "KB", ownHandle: "tamarindtide", focus: "monsoon hooks", known: ["already"] },
      { openai: { responses: { create } } as never },
    );
    expect(out.map((b) => b.handle)).toEqual(["minimalist", "sleepyowl"]);
    expect(create).toHaveBeenCalledTimes(1);
    const req = create.mock.calls[0][0];
    expect(req.tools).toEqual([{ type: "web_search" }]);
    const sent = JSON.stringify(req.input);
    expect(sent).toContain("monsoon hooks");
    expect(sent).toContain("already");
  });

  it("throws when the answer is not the JSON it asked for", async () => {
    const create = vi.fn().mockResolvedValue({ output_text: "Sorry, I could not search." });
    await expect(findBrands(
      { clientName: "C", kbText: "", ownHandle: null, focus: null, known: [] },
      { openai: { responses: { create } } as never },
    )).rejects.toThrow();
  });
});
