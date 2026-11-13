import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("next/navigation", () => ({ usePathname: () => "/clients/acme" }));
const fetchMe = vi.fn();
vi.mock("@/services/me.service", () => ({ fetchMe: () => fetchMe() }));

import { AccessProvider } from "../access-provider";
import { useCan } from "../use-can";
import { useIdentity } from "@/hooks/use-identity";
import { meKeys } from "@/hooks/queries/me";
import { testMePayload } from "@/lib/me/test-fixtures";

function Probe() {
  const { identity } = useIdentity();
  const answers = [
    useCan("edit", "c1"),
    useCan("edit", "c9"),
    useCan("generate", "c1"),
    useCan("view", "c1"),
    useCan("view", ""),
    useCan("manage_team"),
  ];
  return <p>{[identity?.name, ...answers].join("|")}</p>;
}

// The app's own client defaults (src/components/layout/query-provider.tsx).
const appClient = () =>
  new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 } } });

describe("AccessProvider", () => {
  beforeEach(() => fetchMe.mockReset());

  it("answers on the first render from the server payload, with no request", () => {
    const client = appClient();
    const payload = testMePayload({ permissions: ["view", "edit"], clients: [{ clientId: "c1", permissions: ["view", "edit"] }] });
    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <AccessProvider initial={payload}><Probe /></AccessProvider>
      </QueryClientProvider>,
    );
    // An empty client id is what useClientId() returns outside a canvas: it fails closed.
    expect(html).toContain("Arun|true|false|false|true|false|false");
    expect(fetchMe).not.toHaveBeenCalled();
    expect(client.getQueryCache().find({ queryKey: meKeys.current() })?.isStaleByTime(30_000)).toBe(false);
  });

  it("allows nothing before anything is known", () => {
    const html = renderToStaticMarkup(
      <QueryClientProvider client={appClient()}>
        <AccessProvider initial={null}><Probe /></AccessProvider>
      </QueryClientProvider>,
    );
    expect(html).toContain("|false|false|false|false|false|false");
  });
});
