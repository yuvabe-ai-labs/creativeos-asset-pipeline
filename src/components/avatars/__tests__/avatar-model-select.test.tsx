import { describe, it, expect, vi } from "vitest";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { seededModelCatalog, withModel } from "@/lib/ai-models/test-catalog";
import { imageModelsFrom, type ImageModels } from "@/lib/ai-models/model-lists";

const state = vi.hoisted(() => ({ images: null as unknown as ImageModels }));
vi.mock("@/hooks/queries/ai-models", () => ({ useImageModels: () => state.images }));

// A closed Base UI Select renders no options server-side, so the list is rendered inline here to
// read which models it offers.
vi.mock("@/components/ui/select", () => {
  const Pass = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    Select: Pass, SelectContent: Pass, SelectGroup: Pass, SelectLabel: Pass, SelectTrigger: Pass, SelectValue: Pass,
    SelectItem: ({ children }: { children?: ReactNode }) => <div data-item="">{children}</div>,
  };
});

import { AvatarModelSelect } from "../avatar-model-select";

const hiddenPro = () =>
  imageModelsFrom(withModel(seededModelCatalog(), "gemini:gemini-3-pro-image", { status: "hidden", label: "Pro Hidden" }));

describe("AvatarModelSelect", () => {
  it("offers live models only: no hidden model that is not selected, no retired model", () => {
    state.images = hiddenPro();
    const html = renderToStaticMarkup(<AvatarModelSelect id="m" value="openai:gpt-image-2" onChange={() => {}} />);
    expect(html).toContain("GPT Image 2.5 Sunburst");
    expect(html).not.toContain("Pro Hidden");
    expect(html).not.toMatch(/GPT Image 1</);
  });

  it("never lists a hidden model, even the selected one (avatars and panels store no model), but names it on the trigger", () => {
    state.images = hiddenPro();
    const html = renderToStaticMarkup(<AvatarModelSelect id="m" value="gemini:gemini-3-pro-image" onChange={() => {}} />);
    expect(html.match(/Pro Hidden/g)?.length).toBe(1);
    expect(html).not.toMatch(/data-item=""><span[^>]*>Pro Hidden/);
  });

  it("still narrows to the given model ids", () => {
    state.images = imageModelsFrom(seededModelCatalog());
    const html = renderToStaticMarkup(
      <AvatarModelSelect id="m" value="openai:gpt-image-2" onChange={() => {}} modelIds={["openai:gpt-image-2"]} />,
    );
    expect(html.match(/data-item/g)?.length).toBe(1);
  });
});
