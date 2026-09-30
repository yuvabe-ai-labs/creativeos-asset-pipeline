import { describe, expect, it } from "vitest";
import { redactDataUrls } from "./request";

describe("redactDataUrls", () => {
  it("shortens long data URLs anywhere in a payload, keeping their type and size", () => {
    const big = `data:audio/mp3;base64,${"A".repeat(4096)}`;
    const out = redactDataUrls({ voice: { audioUrl: big, note: "warm" }, list: [big] }) as {
      voice: { audioUrl: string; note: string };
      list: string[];
    };
    expect(out.voice.audioUrl).toBe("data:audio/mp3;base64,…(4 KB)");
    expect(out.voice.note).toBe("warm");
    expect(out.list[0]).toBe("data:audio/mp3;base64,…(4 KB)");
  });

  it("leaves ordinary strings and short values alone", () => {
    expect(redactDataUrls({ url: "https://x/v.mp4", n: 5 })).toEqual({ url: "https://x/v.mp4", n: 5 });
  });
});
