import { describe, it, expect } from "vitest";
import { workingTitle, workingHint } from "../working-steps";

describe("dubbing working copy", () => {
  it("names the language", () => {
    expect(workingTitle("dub", "Tamil")).toBe("Dubbing into Tamil");
    expect(workingTitle("lipsync", "Hindi")).toBe("Lip-syncing the Hindi dub");
  });

  it("says what each job does, in plain words", () => {
    expect(workingHint("dub")).toMatch(/own voice/);
    expect(workingHint("lipsync")).toMatch(/mouth/);
  });
});
