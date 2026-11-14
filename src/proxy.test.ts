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
    const res = await proxy(new NextRequest("http://localhost/team?x=1", { headers: { "x-pathname": "/onboarding" } }));
    expect(res.headers.get("x-middleware-request-x-pathname")).toBe("/team");
  });
});
