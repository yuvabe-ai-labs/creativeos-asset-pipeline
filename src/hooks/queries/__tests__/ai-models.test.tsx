import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { seededModelCatalog } from "@/lib/ai-models/test-catalog";
import { imageModelsFrom, videoModelsFrom } from "@/lib/ai-models/model-lists";

const catalogFn = vi.fn();
vi.mock("@/services/ai-models.service", () => ({ aiModelsService: { catalog: () => catalogFn() } }));

import { aiModelKeys, useAiCatalog, useImageModels, useVideoModels } from "../ai-models";

// No DOM in this suite (environment: node), so hooks are exercised through a server render.
function render(client: QueryClient, ui: ReactNode) {
  return renderToStaticMarkup(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}
const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

describe("useAiCatalog", () => {
  it("uses the catalog it is given without a request", () => {
    const catalog = seededModelCatalog();
    let seen: unknown;
    function Probe() {
      seen = useAiCatalog(catalog).data;
      return null;
    }
    render(newClient(), <Probe />);
    expect(seen).toBe(catalog);
    expect(catalogFn).not.toHaveBeenCalled();
  });
});

describe("useImageModels / useVideoModels", () => {
  it("return the cached lists for the session's catalog", () => {
    const catalog = seededModelCatalog();
    const client = newClient();
    client.setQueryData(aiModelKeys.catalog(), catalog);
    let seen: { images: unknown; videos: unknown } | undefined;
    function Probe() {
      seen = { images: useImageModels(), videos: useVideoModels() };
      return null;
    }
    render(client, <Probe />);
    expect(seen?.images).toBe(imageModelsFrom(catalog));
    expect(seen?.videos).toBe(videoModelsFrom(catalog));
  });

  it("throw outside the gate, when nothing is cached", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    function Probe() {
      useImageModels();
      return null;
    }
    expect(() => render(newClient(), <Probe />)).toThrow("ModelCatalogGate");
  });
});
