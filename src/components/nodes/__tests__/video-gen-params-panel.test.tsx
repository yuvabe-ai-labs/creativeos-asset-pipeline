import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { seededModelCatalog } from "@/lib/ai-models/test-catalog";
import { imageModelsFrom, videoModelsFrom } from "@/lib/ai-models/model-lists";

vi.mock("@/hooks/queries/ai-models", async (orig) => ({
  ...(await orig<typeof import("@/hooks/queries/ai-models")>()),
  useImageModels: () => imageModelsFrom(seededModelCatalog()),
  useVideoModels: () => videoModelsFrom(seededModelCatalog()),
}));

import { VideoGenParamsPanel, hasParamsInGroup } from "../video-gen-params-panel";
import { GEMINI_OMNI_MODEL_ID } from "@/lib/ai-models/model-ids";

describe("hasParamsInGroup", () => {
  const videos = videoModelsFrom(seededModelCatalog());
  it("reads the spec it is given: one visible advanced param makes the group", () => {
    const omni = videos.get(GEMINI_OMNI_MODEL_ID)!;
    expect(hasParamsInGroup(omni, "advanced")).toBe(false);
    const withAdvanced = {
      ...omni,
      params: [...omni.params, { ...omni.params[0], name: "seed", group: "advanced" as const, visible: true }],
    };
    expect(hasParamsInGroup(withAdvanced, "advanced")).toBe(true);
    const hiddenAdvanced = {
      ...omni,
      params: [...omni.params, { ...omni.params[0], name: "seed", group: "advanced" as const, visible: false }],
    };
    expect(hasParamsInGroup(hiddenAdvanced, "advanced")).toBe(false);
  });

  it("is false for no model", () => {
    expect(hasParamsInGroup(undefined, "advanced")).toBe(false);
  });
});

type Fixed = Record<string, { value: string; note: string; onOpen?: () => void }>;
const render = (fixedParams?: Fixed) =>
  renderToStaticMarkup(
    <VideoGenParamsPanel
      modelId={GEMINI_OMNI_MODEL_ID}
      params={{ resolution: "720p", duration: 6 }}
      onParamChange={vi.fn()}
      fixedParams={fixedParams}
    />,
  );
const note = "Adds up the 3 shots on the Multishot node.";

// D429/D431 — on the multishot lane duration is the shots' total, shown as a value whose note
// sits behind the label's (i), and which opens the Multishot node when it can.
describe("VideoGenParamsPanel fixed params (D429, D431)", () => {
  it("shows a fixed duration as its value, with no slider, and its note behind the (i)", () => {
    const html = render({ duration: { value: "12s", note } });
    expect(html).toContain("12s");
    expect(html).toContain(`aria-label="${note}"`);
    expect(html).not.toContain('role="slider"');
    expect(html).toContain("720p"); // the other params keep their controls
  });

  it("makes the value a button when it can open the node that sets it", () => {
    const withOpen = render({ duration: { value: "12s", note, onOpen: vi.fn() } });
    const without = render({ duration: { value: "12s", note } });
    const buttonWith12s = /<button\b[^>]*>(?:(?!<\/button>)[\s\S])*12s/;
    expect(withOpen).toMatch(buttonWith12s);
    expect(without).not.toMatch(buttonWith12s);
  });

  it("puts a param's own description behind the (i), not under the control", () => {
    const html = render();
    expect(html).toMatch(/aria-label="720p is the only natively rendered tier[^"]*"/);
    expect(html).not.toMatch(/<p[^>]*>720p is the only natively rendered tier/);
    expect(html).toMatch(/data-slot="slider"|role="slider"/);
  });
});
