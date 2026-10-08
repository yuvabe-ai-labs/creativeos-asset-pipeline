import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/image-gen/billed-run", () => ({ runBilledImageGeneration: vi.fn() }));
vi.mock("@/lib/storage", () => ({ uploadScriptPanel: vi.fn() }));

import { runBilledImageGeneration } from "@/lib/image-gen/billed-run";
import { uploadScriptPanel } from "@/lib/storage";
import { runPanelGeneration } from "../run-panel";
import { HOUSE_STYLE_REF } from "../house-style";

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(runBilledImageGeneration).mockResolvedValue({ generation: { id: "g1" } as never, creditsCharged: 7 });
});

describe("runPanelGeneration", () => {
  it("draws with the chosen model, GPT Image 2 by default", async () => {
    await runPanelGeneration({
      clientId: "c1", scriptId: "s1", shotId: "s06", orgId: "org-1", userId: "u1", userEmail: null,
      aspect: "9:16", prompt: "A panel.", referenceUrls: [], modelId: "gemini:gemini-3.1-flash-image",
    });
    expect(vi.mocked(runBilledImageGeneration).mock.calls[0][0].modelId).toBe("gemini:gemini-3.1-flash-image");
  });

  it("draws with the default model for the script, and stores the panel under its shot", async () => {
    await runPanelGeneration({
      clientId: "c1", scriptId: "s1", shotId: "s06", orgId: "org-1", userId: "u1", userEmail: null,
      aspect: "9:16", prompt: "A panel.", referenceUrls: ["a", "b"],
    });
    const call = vi.mocked(runBilledImageGeneration).mock.calls[0][0];
    expect(call).toMatchObject({
      owner: { scriptId: "s1" }, modelId: "openai:gpt-image-2", aspect: "9:16",
      inputsSnapshot: { slot: "panel", shotId: "s06", prompt: "A panel.", referenceUrls: ["a", "b", "house-style:v1"] },
    });
    // The house style image goes last, inline; the generation row records only its id.
    expect(call.referenceUrls).toEqual(["a", "b", HOUSE_STYLE_REF.dataUrl]);
    expect(HOUSE_STYLE_REF.dataUrl.startsWith("data:image/jpeg;base64,")).toBe(true);
    await call.store(Buffer.from("x"), "image/png");
    expect(uploadScriptPanel).toHaveBeenCalledWith(expect.objectContaining({ clientId: "c1", scriptId: "s1", shotId: "s06", ext: "png" }));
  });
});
