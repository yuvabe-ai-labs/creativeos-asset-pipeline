import { describe, it, expect } from "vitest";
import { speakersOf } from "../use-canvas-people";
import type { ReelScript } from "@/lib/nodes/reel-script";

// D476 — the script's speakers join the Multishot's speaker list, so a character with no avatar
// yet can be picked.
describe("speakersOf", () => {
  it("lists each on-camera speaker once, in the order they first speak, never the narrator", () => {
    const script = {
      visual_script: {
        shots: [
          { voiceover: [{ text: "Hi.", speaker: "narrator" }, { text: "Look.", speaker: "Amma" }] },
          { voiceover: [{ text: "Yes.", speaker: " Ravi " }, { text: "Again.", speaker: "Amma" }] },
          {},
        ],
      },
    } as unknown as ReelScript;
    expect(speakersOf(script)).toEqual(["Amma", "Ravi"]);
  });

  it("is empty with no script", () => {
    expect(speakersOf(undefined)).toEqual([]);
  });
});
