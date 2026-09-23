import { describe, it, expect } from "vitest";
import { voiceoverMappingIssue, renderVoiceover, joinVoLines } from "../voiceover";
import type { ReelScript } from "../reel-script";

const script = (voiceover: string, lines: string[][] | null): ReelScript => ({
  voiceover,
  visual_script: {
    shots: (lines ?? [[], []]).map((l, i) => ({
      description: `shot ${i}`,
      ...(lines ? { voiceover: l.map((text) => ({ text, speaker: "narrator" })) } : {}),
    })),
  },
});

describe("voiceoverMappingIssue", () => {
  it("is null when the mapped lines reproduce the reel VO (timecodes and labels ignored)", () => {
    expect(
      voiceoverMappingIssue(
        script('VO (0-2s): "Every day takes you somewhere." 4-8s: "To work." "To chill."', [
          ["Every day takes you somewhere."],
          ["To work.", "To chill."],
        ]),
      ),
    ).toBeNull();
  });

  it("flags a dropped line", () => {
    expect(
      voiceoverMappingIssue(script("Every day takes you somewhere. To work. Step out different.", [
        ["Every day takes you somewhere."],
        ["To work."],
      ])),
    ).toBe("VO mapping dropped or changed a line — re-parse or edit the shot lines.");
  });

  it("flags a changed line", () => {
    expect(
      voiceoverMappingIssue(script("Every day takes you somewhere.", [["Every day takes you anywhere."], []])),
    ).toBe("VO mapping dropped or changed a line — re-parse or edit the shot lines.");
  });

  it("is null for a script with no voiceover and no mapped lines", () => {
    expect(voiceoverMappingIssue(script("None. Let the product carry it.", [[], []]))).toBeNull();
    expect(voiceoverMappingIssue(script("", [[], []]))).toBeNull();
  });

  it("flags lines mapped onto a script that says there is no voiceover", () => {
    expect(voiceoverMappingIssue(script("No voiceover", [["Hello."], []]))).toBe(
      "VO mapping dropped or changed a line — re-parse or edit the shot lines.",
    );
  });

  it("is null for an old parse with no per-shot voiceover key", () => {
    expect(voiceoverMappingIssue(script("Every day takes you somewhere.", null))).toBeNull();
  });

  it("is null for a null script", () => {
    expect(voiceoverMappingIssue(null)).toBeNull();
  });

  it("flags a changed word even when it's a prefix of the reel word (whole-word match)", () => {
    expect(
      voiceoverMappingIssue(script("Come to workshop now.", [["Come to work"], []])),
    ).toBe("VO mapping dropped or changed a line — re-parse or edit the shot lines.");
  });

  it("is null for a bare numeric range that isn't a timecode", () => {
    expect(
      voiceoverMappingIssue(
        script("Save 20-30% this week only.", [["Save 20-30% this week only."], []]),
      ),
    ).toBeNull();
  });

  it("is null when a descriptive label surrounds a quoted line", () => {
    expect(
      voiceoverMappingIssue(
        script(
          'Voiceover, off-screen male narrator, warm and unhurried: at 0-2s "Every day takes you somewhere."',
          [["Every day takes you somewhere."], []],
        ),
      ),
    ).toBeNull();
  });

  it("is null when curly quotes in the reel match straight quotes in the mapped line", () => {
    expect(
      voiceoverMappingIssue(
        script("Don’t stop, you’re almost there.", [
          ["Don't stop, you're almost there."],
          [],
        ]),
      ),
    ).toBeNull();
  });

  it("flags a dropped quoted line even when another quoted line on the same reel is mapped", () => {
    expect(
      voiceoverMappingIssue(
        script('VO: "Every day takes you somewhere." then "To work."', [
          ["Every day takes you somewhere."],
          [],
        ]),
      ),
    ).toBe("VO mapping dropped or changed a line — re-parse or edit the shot lines.");
  });

  it("flags plain sentences dropped outside a reel's only quoted span", () => {
    expect(
      voiceoverMappingIssue(
        script('"Every day takes you somewhere." To work. To chill.', [
          ["Every day takes you somewhere."],
          [],
        ]),
      ),
    ).toBe("VO mapping dropped or changed a line — re-parse or edit the shot lines.");
  });

  it("is null when the plain sentences outside the quote are also mapped", () => {
    expect(
      voiceoverMappingIssue(
        script('"Every day takes you somewhere." To work. To chill.', [
          ["Every day takes you somewhere."],
          ["To work.", "To chill."],
        ]),
      ),
    ).toBeNull();
  });

  it("is null for Chupps-style labels around several quotes, all lines mapped", () => {
    expect(
      voiceoverMappingIssue(
        script(
          'Voiceover, off-screen male narrator, warm neutral Indian English, unhurried and low-key confident, not an announcer: at 0-2s "Every day takes you somewhere." Then one short beat per cut from 4s: "To work." "To chill."',
          [["Every day takes you somewhere."], ["To work.", "To chill."]],
        ),
      ),
    ).toBeNull();
  });

  it("is null for MM:SS timecodes in unquoted prose", () => {
    expect(
      voiceoverMappingIssue(
        script(
          "0:00.4 – 0:02.4 Every day takes you somewhere. 0:04.0 – 0:08.0 To work. To chill.",
          [["Every day takes you somewhere."], ["To work.", "To chill."]],
        ),
      ),
    ).toBeNull();
  });

  it("flags a dropped sentence outside the quote even though it contains a colon", () => {
    expect(
      voiceoverMappingIssue(
        script(
          '"Hook line." This is a long meaningful sentence that was dropped entirely: ok.',
          [["Hook line."], []],
        ),
      ),
    ).toBe("VO mapping dropped or changed a line — re-parse or edit the shot lines.");
  });

  it("flags a ratio colon in trailing prose that isn't a quote label", () => {
    expect(
      voiceoverMappingIssue(script('"Intro line." Ratio: 3:1 test.', [["Intro line."], []])),
    ).toBe("VO mapping dropped or changed a line — re-parse or edit the shot lines.");
  });

  it("is null for a trailing bracketed production note", () => {
    expect(
      voiceoverMappingIssue(script('"To chill." (Music ducks under the line.)', [["To chill."]])),
    ).toBeNull();
  });

  it("is null for Chupps-style labels ending in colon + at + timecode before each quote", () => {
    expect(
      voiceoverMappingIssue(
        script(
          'Voiceover, off-screen male narrator, warm neutral Indian English, unhurried and low-key confident, not an announcer: at 0-2s "Every day takes you somewhere." Then one short beat per cut from 4s: "To work." "To chill."',
          [["Every day takes you somewhere."], ["To work.", "To chill."]],
        ),
      ),
    ).toBeNull();
  });

  it("is null for a connective word between two quotes", () => {
    expect(
      voiceoverMappingIssue(
        script('VO: "Every day takes you somewhere." then "To work."', [
          ["Every day takes you somewhere."],
          ["To work."],
        ]),
      ),
    ).toBeNull();
  });

  it("is null for a bracketed note between two quotes", () => {
    expect(
      voiceoverMappingIssue(
        script('"Hello there." [beat] "Welcome back."', [["Hello there."], ["Welcome back."]]),
      ),
    ).toBeNull();
  });
});

describe("renderVoiceover", () => {
  it("renders a narrator line", () => {
    expect(renderVoiceover([{ text: "Part of my cooking now.", speaker: "narrator" }])).toBe(
      'Voiceover: "Part of my cooking now."',
    );
  });

  it("names an on-screen speaker", () => {
    expect(renderVoiceover([{ text: "Try it.", speaker: "Riya" }])).toBe('Riya says: "Try it."');
  });

  it("puts a stated delivery in parentheses and a non-English language after it", () => {
    expect(
      renderVoiceover([
        { text: "Sollunga.", speaker: "narrator", delivery: "warm, unhurried", language: "Tamil" },
      ]),
    ).toBe('Voiceover (warm, unhurried) in Tamil: "Sollunga."');
  });

  it("treats empty strings from strict-mode output as absent, and English as unremarkable", () => {
    expect(
      renderVoiceover([{ text: "Hello.", speaker: "narrator", delivery: "", language: "English" }]),
    ).toBe('Voiceover: "Hello."');
  });

  it("joins several lines in order with one space", () => {
    expect(
      renderVoiceover([
        { text: "First.", speaker: "narrator" },
        { text: "Second.", speaker: "Riya" },
      ]),
    ).toBe('Voiceover: "First." Riya says: "Second."');
  });

  it("is empty for no lines, an empty list, or blank text", () => {
    expect(renderVoiceover(undefined)).toBe("");
    expect(renderVoiceover([])).toBe("");
    expect(renderVoiceover([{ text: "   ", speaker: "narrator" }])).toBe("");
  });
});

describe("joinVoLines", () => {
  it("joins every shot's lines in order, text only", () => {
    expect(
      joinVoLines([
        { description: "a", voiceover: [{ text: "First.", speaker: "narrator" }] },
        { description: "b", voiceover: [] },
        { description: "c", voiceover: [{ text: "Second.", speaker: "Riya" }] },
      ]),
    ).toBe("First. Second.");
  });

  it("is empty when no shot has a line", () => {
    expect(joinVoLines([{ description: "a" }, { description: "b", voiceover: [] }])).toBe("");
  });

  it("keeps a rewritten reel copy in step with the lines it came from", () => {
    const shots = [{ description: "a", voiceover: [{ text: "Edited line.", speaker: "narrator" }] }];
    expect(
      voiceoverMappingIssue({ voiceover: joinVoLines(shots), visual_script: { shots } }),
    ).toBeNull();
  });
});
