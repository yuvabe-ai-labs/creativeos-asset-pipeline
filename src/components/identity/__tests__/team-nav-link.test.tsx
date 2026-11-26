import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
vi.mock("@/services/me.service", () => ({ fetchMe: vi.fn() }));

import { TeamNavLink } from "../team-nav-link";
import { AccessProvider } from "@/components/permissions/access-provider";
import { testMePayload } from "@/lib/me/test-fixtures";

const render = (payload: ReturnType<typeof testMePayload>) =>
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <AccessProvider initial={payload}><TeamNavLink /></AccessProvider>
    </QueryClientProvider>,
  );

describe("TeamNavLink (spec §6.1)", () => {
  it("shows the owner the Team link with how many signed up", () => {
    const html = render(testMePayload({ isOwner: true, clients: [], signedUpCount: 2 }));
    expect(html).toContain('href="/team"');
    expect(html).toContain("Team");
    expect(html).toContain(">2<");
  });

  it("shows no count when nobody is waiting", () => {
    expect(render(testMePayload({ isOwner: true, clients: [], signedUpCount: 0 }))).not.toMatch(/>0</);
  });

  it("is not shown to a member", () => {
    expect(render(testMePayload())).toBe("");
  });
});
