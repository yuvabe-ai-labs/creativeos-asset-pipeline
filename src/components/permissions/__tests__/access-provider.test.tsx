import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("next/navigation", () => ({ usePathname: () => "/clients/acme" }));
const fetchMe = vi.fn();
vi.mock("@/services/me.service", () => ({ fetchMe: () => fetchMe() }));

import { AccessProvider } from "../access-provider";
import { useCan, useCanSeeClient } from "../use-can";
import { useIdentity } from "@/hooks/use-identity";
import { meKeys } from "@/hooks/queries/me";
import { testMePayload } from "@/lib/me/test-fixtures";
import { testAccess } from "@/lib/permissions/test-fixtures";

function Probe() {
  const { identity } = useIdentity();
  const edit = useCan("scripts.edit", "c1");
  const editElsewhere = useCan("scripts.edit", "c9");
  const generate = useCan("image_generation.generate", "c1");
  const sees = useCanSeeClient("c1");
  return <p>{[identity?.name, edit, editElsewhere, generate, sees].join("|")}</p>;
}

// The app's own client defaults (src/components/layout/query-provider.tsx).
const appClient = () =>
  new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 } } });

describe("AccessProvider", () => {
  beforeEach(() => fetchMe.mockReset());

  it("renders the right answers on the first render from the server payload, with no request", () => {
    const client = appClient();
    const payload = testMePayload(testAccess({ keys: ["scripts.view", "scripts.edit"], clientIds: ["c1"] }));
    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <AccessProvider initial={payload}><Probe /></AccessProvider>
      </QueryClientProvider>,
    );
    expect(html).toContain("Arun|true|false|false|true");
    expect(fetchMe).not.toHaveBeenCalled();
    // Fresh, so mounting in the browser does not refetch either.
    expect(client.getQueryCache().find({ queryKey: meKeys.current() })?.isStaleByTime(30_000)).toBe(false);
  });

  it("allows nothing before anything is known", () => {
    const html = renderToStaticMarkup(
      <QueryClientProvider client={appClient()}>
        <AccessProvider initial={null}><Probe /></AccessProvider>
      </QueryClientProvider>,
    );
    expect(html).toContain("|false|false|false|false");
  });
});
