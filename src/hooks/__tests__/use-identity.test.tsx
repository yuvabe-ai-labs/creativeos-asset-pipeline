import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
vi.mock("@/services/me.service", () => ({ fetchMe: vi.fn() }));

import { useIdentity } from "../use-identity";
import { meKeys } from "@/hooks/queries/me";
import { testMePayload } from "@/lib/me/test-fixtures";
import { testAccess } from "@/lib/permissions/test-fixtures";

function Probe() {
  const { identity, hydrated, orgName, presetName, creditsUsed } = useIdentity();
  return <p>{[identity?.name, hydrated, orgName, presetName, creditsUsed].join("|")}</p>;
}

const render = (client: QueryClient) =>
  renderToStaticMarkup(<QueryClientProvider client={client}><Probe /></QueryClientProvider>);

describe("useIdentity", () => {
  it("selects from the me query: no second cache", () => {
    const client = new QueryClient();
    client.setQueryData(meKeys.current(), testMePayload(testAccess({ keys: [] }), { creditsUsed: null }));
    expect(render(client)).toContain("Arun|true|Yuvabe Studios|Designer|");
  });

  it("is not hydrated before anything is known", () => {
    expect(render(new QueryClient())).toContain("|false|||");
  });
});
