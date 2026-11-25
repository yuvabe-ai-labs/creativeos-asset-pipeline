import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { seededModelCatalog, withCreditSettings } from "@/lib/ai-models/test-catalog";
import { imageModelsFrom, videoModelsFrom } from "@/lib/ai-models/model-lists";

const catalogFn = vi.fn();
vi.mock("@/services/ai-models.service", () => ({ aiModelsService: { catalog: () => catalogFn() } }));

import { aiModelKeys, useAiCatalog, useCreditSettings, useImageModels, useVideoModels } from "../ai-models";

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

describe("useCreditSettings (D571)", () => {
  it("is the row live now, from the cached catalog, without a request", () => {
    const hour = 3_600_000;
    const catalog = withCreditSettings(seededModelCatalog(), [
      { effectiveFrom: new Date(Date.now() - 24 * hour).toISOString(), marginPercent: 0, roundStep: 5 },
      { effectiveFrom: new Date(Date.now() - hour).toISOString(), marginPercent: 10, roundStep: 1 },
      { effectiveFrom: new Date(Date.now() + 24 * hour).toISOString(), marginPercent: 20, roundStep: 10 },
    ]);
    const client = newClient();
    client.setQueryData(aiModelKeys.catalog(), catalog);
    let seen: unknown;
    function Probe() {
      seen = useCreditSettings();
      return null;
    }
    render(client, <Probe />);
    expect(seen).toBe(catalog.creditSettings[1]);
    expect(catalogFn).not.toHaveBeenCalled();
  });

  it("is null while the catalog has not loaded", () => {
    catalogFn.mockReturnValue(new Promise(() => {}));
    let seen: unknown = "unset";
    function Probe() {
      seen = useCreditSettings();
      return null;
    }
    render(newClient(), <Probe />);
    expect(seen).toBeNull();
  });
});
