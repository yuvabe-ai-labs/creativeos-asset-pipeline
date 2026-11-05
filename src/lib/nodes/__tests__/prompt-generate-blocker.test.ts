import { describe, expect, it } from "vitest";
import { promptGenerateBlocker } from "../prompt-generate-blocker";
import { imageGenerateDisabled } from "@/lib/image-gen/generate-blocker";

const shot = { id: "s1", label: "Shot 1" };
const file = { id: "f1", label: "Brief" };
const base = {
  editable: true,
  loadingInputs: false,
  wired: [shot],
  resolved: [{ nodeId: "s1", text: "A mug on a desk" }],
  instruction: "",
};

describe("promptGenerateBlocker", () => {
  it("is ready when every wired input has content", () => {
    expect(promptGenerateBlocker(base)).toBeNull();
  });

  it("counts an image as content", () => {
    expect(
      promptGenerateBlocker({ ...base, resolved: [{ nodeId: "s1", text: "", fileUrl: "https://x/a.png" }] }),
    ).toBeNull();
  });

  it("holds the button while the inputs load, and says so", () => {
    const blocker = promptGenerateBlocker({ ...base, loadingInputs: true });
    expect(blocker).toBe("Loading the connected inputs…");
    expect(imageGenerateDisabled(blocker, false, true)).toBe(true);
  });

  it("holds a read-only canvas", () => {
    expect(promptGenerateBlocker({ ...base, editable: false })).toBe("This canvas is read-only.");
  });

  it("needs an input or an instruction", () => {
    const none = { ...base, wired: [], resolved: [] };
    expect(promptGenerateBlocker(none)).toBe("Connect an input, or write an instruction, to generate.");
    expect(promptGenerateBlocker({ ...none, instruction: "A close-up" })).toBeNull();
  });

  it("names a wired input with nothing in it yet", () => {
    expect(promptGenerateBlocker({ ...base, resolved: [{ nodeId: "s1", text: "  " }] })).toBe(
      "Shot 1 has no content yet. Add it at that node first.",
    );
  });

  it("asks for extraction on a File still waiting for it", () => {
    expect(
      promptGenerateBlocker({ ...base, wired: [file], resolved: [{ nodeId: "f1", text: "", useLlm: true }] }),
    ).toBe("Run extraction in Brief first.");
  });

  it("counts several empty inputs", () => {
    expect(
      promptGenerateBlocker({
        ...base,
        wired: [shot, file],
        resolved: [{ nodeId: "s1", text: "" }, { nodeId: "f1", text: "" }],
      }),
    ).toBe("2 connected inputs have no content yet.");
  });

  it("never reads an input the server did not answer for as empty", () => {
    expect(promptGenerateBlocker({ ...base, wired: [shot, file], resolved: [] })).toBeNull();
  });
});
