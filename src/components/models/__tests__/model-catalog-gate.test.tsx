import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { seededModelCatalog } from "@/lib/ai-models/test-catalog";

const catalogFn = vi.fn();
vi.mock("@/services/ai-models.service", () => ({ aiModelsService: { catalog: () => catalogFn() } }));

import { aiModelKeys } from "@/hooks/queries/ai-models";
import { ModelCatalogGate } from "../model-catalog-gate";

// No DOM in this suite (environment: node), so each state is rendered on the server from a seeded cache.
const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
const mount = (client: QueryClient, ui: ReactNode) =>
  renderToStaticMarkup(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);

describe("ModelCatalogGate", () => {
  it("renders its children at once with a catalog from the server", () => {
    const html = mount(newClient(), <ModelCatalogGate initialCatalog={seededModelCatalog()}><p>inside</p></ModelCatalogGate>);
    expect(html).toContain("inside");
    expect(catalogFn).not.toHaveBeenCalled();
  });

  it("holds its children back while the catalog loads", () => {
    const html = mount(newClient(), <ModelCatalogGate><p>inside</p></ModelCatalogGate>);
    expect(html).not.toContain("inside");
    expect(html).toContain("Loading");
  });

  it("renders its children once the catalog is cached", () => {
    const client = newClient();
    client.setQueryData(aiModelKeys.catalog(), seededModelCatalog());
    expect(mount(client, <ModelCatalogGate><p>inside</p></ModelCatalogGate>)).toContain("inside");
  });

  it("says plainly when the models can't load, with a way to try again", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    // retryOnMount off: a server render would otherwise show the refetch it starts, not the failure.
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false } } });
    await client.fetchQuery({ queryKey: aiModelKeys.catalog(), queryFn: () => Promise.reject(new Error("HTTP 500 raw")) }).catch(() => {});
    const html = mount(client, <ModelCatalogGate><p>inside</p></ModelCatalogGate>);
    expect(html).toContain("Could not load the models.");
    expect(html).toContain("Try again");
    expect(html).not.toContain("raw");
    expect(html).not.toContain("inside");
  });

  it("treats a catalog with no image or no video model as a failure", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const c = seededModelCatalog();
    const client = newClient();
    client.setQueryData(aiModelKeys.catalog(), { ...c, models: c.models.filter((m) => m.kind !== "video") });
    const html = mount(client, <ModelCatalogGate><p>inside</p></ModelCatalogGate>);
    expect(html).toContain("Could not load the models.");
    expect(html).not.toContain("inside");
  });
});
