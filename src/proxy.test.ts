import { describe, it, expect, vi } from "vitest";

vi.mock("@supabase/ssr", () => ({ createServerClient: vi.fn() }));
vi.mock("@/lib/supabase/get-user-with-retry", () => ({ getUserWithRetry: vi.fn() }));

import { config } from "./proxy";

// The matcher is a regex source; a path the regex does NOT match skips the session check.
const runsProxy = (path: string) => new RegExp(`^${config.matcher[0]}$`).test(path);

describe("proxy matcher (D309)", () => {
  it("skips the session check for the public review page and API", () => {
    expect(runsProxy("/r/abc")).toBe(false);
    expect(runsProxy("/api/r/abc")).toBe(false);
    expect(runsProxy("/api/r/abc/comments/c1")).toBe(false);
  });
  it("still gates everything else, including look-alike paths", () => {
    expect(runsProxy("/review")).toBe(true);
    expect(runsProxy("/api/review/inbox")).toBe(true);
    expect(runsProxy("/clients/x")).toBe(true);
    expect(runsProxy("/api/nodes/n/client-review")).toBe(true);
  });
  it("keeps the existing exemptions", () => {
    expect(runsProxy("/login")).toBe(false);
    expect(runsProxy("/api/webhooks/trigger")).toBe(false);
  });
  it("skips the session check for the invite sign-up page only (spec 6.3)", () => {
    expect(runsProxy("/invite/abc")).toBe(false);
    expect(runsProxy("/invite")).toBe(true);
    expect(runsProxy("/invites")).toBe(true);
    expect(runsProxy("/api/orgs/o1/invites")).toBe(true);
  });
});

describe("proxy passes the path to the root layout (spec 4.4)", () => {
  it("sets the path request header on a signed-in page request, overwriting any sent one", async () => {
    const { getUserWithRetry } = await import("@/lib/supabase/get-user-with-retry");
    vi.mocked(getUserWithRetry).mockResolvedValue({ id: "u1", app_metadata: {} } as never);
    const { NextRequest } = await import("next/server");
    const { proxy } = await import("./proxy");
    const res = await proxy(new NextRequest("http://localhost/team?x=1", { headers: { "x-pathname": "/onboarding", accept: PAGE_ACCEPT } }));
    expect(res.headers.get("x-middleware-request-x-pathname")).toBe("/team");
  });

  // A redirect thrown by the root layout inside an RSC response stays in the browser's cached
  // root layout, which soft navigations never re-render: every navigation re-throws it, so the
  // browser re-requests /onboarding forever. That is what a sign-up from an invite hit: the
  // action's redirect is rendered as RSC with the path "/", and the layout redirected there.
  it("leaves the path out of RSC renders (soft navigations, refreshes, a server action and its redirect)", async () => {
    const { getUserWithRetry } = await import("@/lib/supabase/get-user-with-retry");
    vi.mocked(getUserWithRetry).mockResolvedValue({ id: "u1", app_metadata: {} } as never);
    const { NextRequest } = await import("next/server");
    const { proxy } = await import("./proxy");
    for (const headers of <Record<string, string>[]>[
      { accept: "*/*" }, // a soft navigation or router.refresh()
      { accept: "text/x-component" }, // the page rendered for a server action's redirect
      { accept: PAGE_ACCEPT, "next-action": "abc" }, // a server action itself
      { "x-pathname": "/team" }, // no accept at all, with a forged path
    ]) {
      const res = await proxy(new NextRequest("http://localhost/", { headers }));
      expect(res.headers.get("x-middleware-request-x-pathname")).toBeNull();
    }
  });
});

const PAGE_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";
