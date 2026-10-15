import { describe, it, expect } from "vitest";
import {
  DUB_LANGUAGES, DEFAULT_DUB_LANGUAGE, isDubLanguage, dubLanguageLabel,
  readDubbingOutput, furthestStage, stageUrl, readDubRecord, readLipSyncRecord,
} from "../types";

const OUT = { language: "hi-IN", original: "https://o.mp4", dubbed: "https://d.mp4", dubbedAudio: "https://d.mp3", lipSynced: null };

describe("dubbing types", () => {
  it("lists the eleven target languages, never the English source", () => {
    expect(DUB_LANGUAGES.map((l) => l.code)).toEqual(["hi-IN", "bn-IN", "gu-IN", "kn-IN", "ml-IN", "mr-IN", "or-IN", "pa-IN", "ta-IN", "te-IN", "as-IN"]);
    expect(isDubLanguage("en-IN")).toBe(false);
    expect(isDubLanguage("ta-IN")).toBe(true);
    expect(DEFAULT_DUB_LANGUAGE).toBe("hi-IN");
    expect(dubLanguageLabel("ta-IN")).toBe("Tamil");
    expect(dubLanguageLabel("xx")).toBe("xx");
  });

  it("reads a dubbing output and rejects anything else", () => {
    expect(readDubbingOutput(OUT)).toEqual(OUT);
    expect(readDubbingOutput({ ...OUT, lipSynced: "https://l.mp4" })?.lipSynced).toBe("https://l.mp4");
    expect(readDubbingOutput("https://video.mp4")).toBeNull();
    expect(readDubbingOutput({ ...OUT, language: "en-IN" })).toBeNull();
    expect(readDubbingOutput({ ...OUT, dubbed: 3 })).toBeNull();
  });

  it("picks the furthest stage and its url", () => {
    expect(furthestStage(OUT as never)).toBe("dubbed");
    const synced = { ...OUT, lipSynced: "https://l.mp4" } as never;
    expect(furthestStage(synced)).toBe("lipSynced");
    expect(stageUrl(synced, "original")).toBe("https://o.mp4");
    expect(stageUrl(OUT as never, "lipSynced")).toBeNull();
  });

  it("reads the dub and lip-sync records", () => {
    const dub = { sourceNodeId: "v", sourceVersionId: "s", sourceUrl: "https://o.mp4", srcLang: "en-IN", targetLang: "hi-IN", durationSeconds: 8, provider: "sarvam", model: "sarvam-dub" };
    expect(readDubRecord(dub)).toEqual(dub);
    expect(readDubRecord({ ...dub, durationSeconds: 0 })).toBeNull();
    expect(readLipSyncRecord({ versionId: "v1", provider: "fal", model: "lipsync-2-pro", runs: 2 })).toEqual({ versionId: "v1", provider: "fal", model: "lipsync-2-pro", runs: 2 });
    expect(readLipSyncRecord({ versionId: "v1" })).toBeNull();
  });
});
