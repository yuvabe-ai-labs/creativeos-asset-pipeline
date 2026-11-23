import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { seededModelCatalog, withModel } from "@/lib/ai-models/test-catalog";
import { imageModelsFrom, type ImageModels } from "@/lib/ai-models/model-lists";
import { PANEL_MODEL_ID } from "@/lib/scripts/visualise/constants";
import { makeScript } from "@/lib/scripts/visualise/__tests__/fixtures";

const state = vi.hoisted(() => ({
  images: null as unknown as ImageModels,
  drawModelIds: [] as string[],
  select: null as null | { value: string; modelIds?: readonly string[] },
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/hooks/queries/ai-models", async (orig) => ({
  ...(await orig<typeof import("@/hooks/queries/ai-models")>()),
  useImageModels: () => state.images,
}));
vi.mock("@/hooks/use-panel-draws", async (orig) => {
  const real = await orig<typeof import("@/hooks/use-panel-draws")>();
  return {
    ...real,
    usePanelDraws: (clientId: string, scriptId: string, modelId: string) => {
      state.drawModelIds.push(modelId);
      return real.usePanelDraws(clientId, scriptId, modelId);
    },
  };
});
// The Advanced section is closed on the server render; open it here to read the picker's props.
vi.mock("@/components/avatars/avatar-advanced-settings", () => ({
  AvatarAdvancedSettings: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/avatars/avatar-model-select", () => ({
  AvatarModelSelect: (props: { value: string; modelIds?: readonly string[] }) => {
    state.select = props;
    return null;
  },
}));

import { VisualiseView } from "../visualise-view";

const render = () => renderToStaticMarkup(
  <QueryClientProvider client={new QueryClient()}>
    <VisualiseView
      clientId="c1"
      initial={{ script: makeScript(undefined, "visualise"), board: { avatars: [], takes: [], picks: {}, kits: [] } }}
    />
  </QueryClientProvider>,
);

describe("VisualiseView panel model (D543)", () => {
  beforeEach(() => {
    state.drawModelIds = [];
    state.select = null;
  });

  it("starts on the panel default while it is live", () => {
    state.images = imageModelsFrom(seededModelCatalog());
    render();
    expect(state.drawModelIds[0]).toBe(PANEL_MODEL_ID);
  });

  it("starts on the live fallback when the panel default is hidden, and never offers the hidden model", () => {
    state.images = imageModelsFrom(withModel(seededModelCatalog(), PANEL_MODEL_ID, { status: "hidden" }));
    render();
    const start = state.images.liveOr(PANEL_MODEL_ID);
    expect(start).not.toBe(PANEL_MODEL_ID);
    expect(state.drawModelIds[0]).toBe(start);
    expect(state.select?.value).toBe(start);
    expect(state.select?.modelIds).not.toContain(PANEL_MODEL_ID);
  });
});
