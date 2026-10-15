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

describe("activeDubbingOf", () => {
  const dub = { language: "hi-IN", original: "o", dubbed: "d", dubbedAudio: "a", lipSynced: null } as const;
  it("returns the active version's dubbing, or null", async () => {
    const { activeDubbingOf } = await import("../types");
    const versions = [{ id: "v2", dubbing: null }, { id: "v1", dubbing: dub }];
    expect(activeDubbingOf({ activeVersionId: "v1", versions })).toEqual(dub);
    expect(activeDubbingOf({ activeVersionId: "v2", versions })).toBeNull();
    expect(activeDubbingOf({ activeVersionId: null, versions })).toBeNull();
  });
});

describe("translation styles", () => {
  it("lists the vendor's registers in plain words, Everyday first and by default", async () => {
    const { DUB_STYLES, DEFAULT_DUB_STYLE, isDubStyle, dubStyleLabel } = await import("../types");
    expect(DUB_STYLES.map((s) => s.code)).toEqual(["modern-colloquial", "common-indic", "formal", "classic-colloquial", "academic", "auto"]);
    expect(DEFAULT_DUB_STYLE).toBe("modern-colloquial");
    expect(dubStyleLabel("modern-colloquial")).toBe("Everyday");
    expect(isDubStyle("formal")).toBe(true);
    expect(isDubStyle("shouty")).toBe(false);
  });

  it("keeps a version's style when it has one, and reads older dubs without it", async () => {
    const { readDubbingOutput } = await import("../types");
    const base = { language: "ta-IN", original: "o", dubbed: "d", dubbedAudio: "a", lipSynced: null };
    expect(readDubbingOutput({ ...base, style: "formal" })?.style).toBe("formal");
    expect(readDubbingOutput(base)?.style).toBeUndefined();
    expect(readDubbingOutput({ ...base, style: "shouty" })?.style).toBeUndefined();
  });
});

describe("preset voices and pace", () => {
  it("offers exactly the 15 voices the vendor accepts, grouped by gender, and four paces", async () => {
    const { DUB_VOICES, DUB_PACES, DEFAULT_DUB_PACE, isDubVoice, isDubPace, dubVoiceLabel, PRESENTER_VOICE } = await import("../types");
    expect(DUB_VOICES.map((v) => v.code).sort()).toEqual(
      ["amit", "dev", "ishita", "kavya", "manan", "pooja", "priya", "rahul", "ratan", "ritu", "rohan", "shreya", "shubh", "simran", "sumit"],
    );
    expect(DUB_VOICES.filter((v) => v.gender === "female").map((v) => v.code)).toEqual(["ishita", "kavya", "pooja", "priya", "ritu", "shreya", "simran"]);
    expect(DUB_PACES.map((p) => p.code)).toEqual(["slow", "moderate", "normal", "fast"]);
    expect(DEFAULT_DUB_PACE).toBe("normal");
    expect(isDubVoice("ishita")).toBe(true);
    expect(isDubVoice(PRESENTER_VOICE)).toBe(false);
    expect(isDubPace("fast")).toBe(true);
    expect(dubVoiceLabel(PRESENTER_VOICE)).toBe("Presenter’s own voice");
  });

  it("keeps a version's preset voice and pace, and reads a presenter-voice dub without one", async () => {
    const { readDubbingOutput, readDubRecord } = await import("../types");
    const base = { language: "ta-IN", original: "o", dubbed: "d", dubbedAudio: "a", lipSynced: null };
    expect(readDubbingOutput({ ...base, voice: "ishita" })?.voice).toBe("ishita");
    expect(readDubbingOutput(base)?.voice).toBeUndefined();
    const rec = { sourceNodeId: "v", sourceVersionId: "s", sourceUrl: "u", srcLang: "en-IN", targetLang: "ta-IN", durationSeconds: 8, provider: "sarvam", model: "sarvam-dub" };
    expect(readDubRecord({ ...rec, voice: "ishita", pace: "slow" })).toMatchObject({ voice: "ishita", pace: "slow" });
  });
});
